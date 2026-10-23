'use strict';

// Player opening, chrome, seek watchdog, tracks, frame watchdog and transport controls.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function openPlayer(file) {
  if (playerHistoryPending) return;
  cancelActiveTouchGesture();
  cancelLibraryEdgeBack();
  pushPlayerHistory(file);
  playerReturnFocus = typeof document.activeElement?.focus === 'function' ? document.activeElement : null;
  state.playbackSession += 1;
  const openingSession = state.playbackSession;
  mediaTransitionCommitting = false;
  swipeCommitPending = false;
  playbackNavigationChain = Promise.resolve();
  state.selected = file;
  state.playbackOrderIds = getPlaybackFileList().map((item) => item.id);
  if (!state.playbackOrderIds.includes(file.id)) state.playbackOrderIds.push(file.id);
  state.playbackDeck = buildAccountPlaybackDeck(getPlaybackFileList(), file.id);
  state.playbackDeckComplete = hasCompletePlaybackPopulation();
  document.body.style.overflow = 'hidden';
  setPlayerBackgroundInert(true);
  setPlayerMediaPriorityActive(true);
  el.playerSheet.hidden = false;
  playerChromePointer = false;
  playerChromeTouch = false;
  setPlayerChromeVisible(false);
  el.playerTitle.textContent = file.name || '이름 없는 파일';
  el.codecNote.textContent = state.demo
    ? '데모 화면은 저장 파일 정보를 예시로 보여 주며 실제 원본 바이트를 재생하지 않습니다.'
    : 'Google Drive 원본 파일의 무변환 전송 여부를 확인하는 중입니다.';
  const isVideo = isVideoPresentation(file);
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.ctrlFramePrev) el.ctrlFramePrev.hidden = !isVideo;
  if (el.ctrlFrameNext) el.ctrlFrameNext.hidden = !isVideo;
  if (el.shortsFramePrev) el.shortsFramePrev.hidden = !isVideo;
  if (el.shortsFrameNext) el.shortsFrameNext.hidden = !isVideo;
  updateFullscreenUI();
  updateQualityDisplay();
  updatePlayPauseUI();
  updateVolumeUI();
  updateSpeedUI();
  resetControlsTimer();
  state.pendingPlay = true;
  openMediaSource(file);
  warmPlaybackNeighborhood(file, { loadPopulation: true });
  requestAnimationFrame(() => {
    if (openingSession === state.playbackSession && !el.playerSheet.hidden) el.mediaStage.focus({ preventScroll: true });
  });
}

function setPlayerBackgroundInert(inert) {
  const main = document.querySelector('main');
  const topbar = document.querySelector('.topbar');
  const skipLink = document.querySelector('.skip-link');
  const updateBanner = document.querySelector('.update-banner');
  [main, topbar, skipLink, updateBanner].forEach((node) => {
    if (node) node.inert = Boolean(inert);
  });
}

function formatPlayerTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minsStr}:${secsStr}`;
  }
  return `${mins}:${secsStr}`;
}

let playerChrome = null;
let playerChromePointer = false;
let playerChromeTouch = false;
let playerInputModality = 'pointer';
let playerRevealPointer = null;
let playerRevealClick = null;

function playerHasKeyboardFocus() {
  return playerInputModality === 'keyboard' && Boolean(playerChrome?.contains(document.activeElement));
}

function isPlayerBottomActivation(x, y) {
  const r = el.playerControlsEntry?.getBoundingClientRect();
  if (!r) return false;
  return x >= r.left && x <= r.right && y <= r.bottom && y >= r.top;
}

function setPlayerChromeVisible(visible) {
  if (!el.playerModal) return;
  el.playerModal.classList.toggle('controls-idle', !visible);
  el.playerModal.classList.remove('immersive');
  if (playerChrome) {
    playerChrome.inert = !visible;
    playerChrome.setAttribute('aria-hidden', String(!visible));
  }
  if (!visible) {
    clearTimeout(controlsHideTimer);
    controlsHideTimer = null;
    closePlayerMoreMenu();
    closeSpeedMenu();
    el.mobileShortsOverlay?.classList.remove('expanded');
    el.shortsMoreBtn?.setAttribute('aria-expanded', 'false');
  }
}

function resetControlsTimer(delay = playerChromeTouch ? 3000 : 320) {
  clearTimeout(controlsHideTimer);
  controlsHideTimer = null;
  // This function only maintains an explicitly revealed layer; never opens it.
  if (!el.playerModal || el.playerSheet?.hidden || el.playerModal.classList.contains('controls-idle')) return;
  if (isSeekingPointer || playerChromePointer || playerHasKeyboardFocus()
    || (playerChromeTouch && hasOpenPlayerControlsMenu())) return;
  controlsHideTimer = setTimeout(() => {
    controlsHideTimer = null;
    if (!isSeekingPointer && !playerChromePointer && !playerHasKeyboardFocus()) setPlayerChromeVisible(false);
  }, typeof delay === 'number' ? delay : 320);
}

function revealPlayerChrome({ touch = false } = {}) {
  playerChromeTouch = touch;
  el.playerModal.dataset.playerInput = playerInputModality;
  setPlayerChromeVisible(true);
  resetControlsTimer();
}

function setupPlayerChrome() {
  if (!el.playerModal || !el.mediaStage || playerChrome) return;
  playerChrome = document.createElement('div');
  playerChrome.className = 'player-chrome';
  [el.playerModal.querySelector('.player-topbar'), el.customVideoControls,
    el.mobileShortsOverlay, el.playerModal.querySelector('.media-info-bar'), el.drivePreviewActions]
    .forEach(node => { if (node) playerChrome.appendChild(node); });
  el.mediaStage.appendChild(playerChrome);
  el.playerControlsEntry?.addEventListener('click', event => {
    const keyboard = event.detail === 0;
    playerInputModality = keyboard ? 'keyboard' : 'pointer';
    revealPlayerChrome({touch:event.pointerType === 'touch'});
    if (!keyboard) { el.mediaStage.focus({preventScroll:true}); return; }
    const first = [...playerChrome.querySelectorAll('button,a,summary,input,select')]
      .find(node => !node.disabled && node.getClientRects().length && !node.closest('[hidden]'));
    first?.focus({ preventScroll: true });
  });
  el.hidePlayerControlsButton?.addEventListener('click', () => {
    el.mediaStage.focus({ preventScroll: true });
    playerChromePointer = false;
    setPlayerChromeVisible(false);
  });
  // A stable focus destination avoids Space activating the last pointer-clicked button.
  el.mediaStage.tabIndex = -1;
  el.mediaStage.setAttribute('aria-label', '미디어 화면. Tab: 미디어 제어, Escape: 닫기');
  el.playerModal.addEventListener('pointermove', event => {
    if (event.pointerType === 'touch' || el.playerSheet.hidden) return;
    const visible = !el.playerModal.classList.contains('controls-idle');
    playerChromePointer = isPlayerBottomActivation(event.clientX, event.clientY)
      || (visible && playerChrome.contains(event.target));
    if (playerChromePointer) revealPlayerChrome();
    else if (!controlsHideTimer) resetControlsTimer();
  }, { passive: true });
  el.playerModal.addEventListener('pointerleave', () => { playerChromePointer = false; resetControlsTimer(); });
  el.playerModal.addEventListener('pointerdown', event => {
    if (event.isPrimary === false) { cancelActiveTouchGesture(); return; }
    playerInputModality = 'pointer';
    playerRevealClick = null;
    const revealOnly = el.playerControlsEntry?.contains(event.target);
    if (event.isPrimary !== false && (event.button == null || event.button === 0)
      && (revealOnly || playerChrome.contains(event.target))) {
      playerRevealPointer = {pointerId:event.pointerId,session:state.playbackSession,revealOnly};
    } else playerRevealPointer = null;
    if (revealOnly) {
      clearTimeout(singleTapTimer); singleTapTimer = null; lastTapTime = 0;
      if (!el.playerModal.classList.contains('controls-idle')) setPlayerChromeVisible(false);
      else revealPlayerChrome({touch:event.pointerType !== 'mouse'});
    }
  }, { capture: true, passive: true });
  const finishRevealPointer = event => {
    if (!playerRevealPointer || event.pointerId !== playerRevealPointer.pointerId) return;
    playerRevealClick = {...playerRevealPointer,expires:performance.now()+500};
    playerRevealPointer = null;
  };
  document.addEventListener('pointerup',finishRevealPointer,{capture:true,passive:true});
  document.addEventListener('pointercancel',finishRevealPointer,{capture:true,passive:true});
  el.playerModal.addEventListener('click', event => {
    const owned = playerRevealClick;
    playerRevealClick = null;
    if (event.detail && owned && owned.session === state.playbackSession
      && performance.now() <= owned.expires
      && (event.pointerId == null || event.pointerId === owned.pointerId)
      && (owned.revealOnly || !playerChrome.contains(event.target))) {
      event.preventDefault();event.stopImmediatePropagation();
      el.mediaStage.focus({preventScroll:true});return;
    }
    if (event.detail && playerChrome.contains(event.target)
      && !event.target.closest?.('button,a,input,select,textarea,summary,details,[role="slider"],[role="button"]')) {
      cancelPendingStageTap();
      event.preventDefault(); event.stopImmediatePropagation();
      el.mediaStage.focus({preventScroll:true});
      playerChromePointer = false;
      setPlayerChromeVisible(false);
      return;
    }
    if (!event.detail || !event.target.closest?.('button,summary')) return;
    // Run after handlers, including ones that stop propagation. Keyboard
    // activation (detail=0), input/select/range controls keep their focus.
    queueMicrotask(() => {
      if (playerInputModality === 'pointer' && !el.playerSheet.hidden
        && !document.querySelector('dialog[open]') && playerChrome.contains(document.activeElement)) {
        el.mediaStage.focus({preventScroll:true});
      }
    });
  }, true);
  el.playerModal.addEventListener('focusin', () => {
    if (playerHasKeyboardFocus()) revealPlayerChrome();
  });
  el.playerModal.addEventListener('focusout', () => resetControlsTimer());
  document.addEventListener('keydown', event => {
    if (event.key !== 'Tab' || el.playerSheet.hidden || document.querySelector('dialog[open]')) return;
    playerInputModality = 'keyboard';
    revealPlayerChrome();
    const selector = 'button,a,summary,input,select,[tabindex="0"]';
    const recovering = el.mediaError && !el.mediaError.hidden;
    const controls = [...(recovering ? el.mediaError.querySelectorAll(selector) : []), ...playerChrome.querySelectorAll(selector)]
      .filter(isOperablePlayerControl);
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement);
    event.preventDefault();
    const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
      : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
    controls[next].focus({ preventScroll: true });
  }, true);
  window.addEventListener('blur', () => { playerChromePointer=false; playerRevealPointer=null; playerRevealClick=null; cancelActiveTouchGesture(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { playerChromePointer=false; playerRevealPointer=null; playerRevealClick=null; cancelActiveTouchGesture(); setPlayerChromeVisible(false); }
  });
  setPlayerChromeVisible(false);
}

function isOperablePlayerControl(node) {
  if (node.disabled || node.matches(':disabled') || node.tabIndex < 0
    || node.closest('[hidden],[inert]') || !node.getClientRects().length) return false;
  // Closed details can expose descendant rectangles without allowing focus.
  const closed = node.closest('details:not([open])');
  if (closed && node !== closed.querySelector(':scope > summary')) return false;
  const style = getComputedStyle(node);
  return style.display !== 'none' && style.visibility === 'visible';
}

function hasOpenPlayerControlsMenu() {
  return Boolean(
    isSpeedMenuOpen || isPlayerMoreOpen
    || el.mobileShortsOverlay?.classList.contains('expanded')
  );
}

function togglePlayPause(event) {
  if (event) event.stopPropagation();
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  if (el.videoPlayer.paused) {
    el.videoPlayer.play().catch((error) => {
      if (error?.name !== 'AbortError') showPlayerFeedback('재생을 시작하지 못함');
    });
  } else {
    el.videoPlayer.pause();
  }
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden && (!state.selected || isVideoPresentation());
  setNativeVideoActionsAvailable(isVideo);
  if (!isVideo) {
    return;
  }
  if (el.customVideoControls) el.customVideoControls.hidden = false;
  const isPaused = el.videoPlayer.paused;
  if (el.ctrlIconPlay && el.ctrlIconPause) {
    el.ctrlIconPlay.toggleAttribute('hidden', !isPaused);
    el.ctrlIconPause.toggleAttribute('hidden', isPaused);
  }
  if (el.iconCenterPlay && el.iconCenterPause) {
    el.iconCenterPlay.toggleAttribute('hidden', !isPaused);
    el.iconCenterPause.toggleAttribute('hidden', isPaused);
  }
  if (el.stageCenterPlayBtn) {
    el.stageCenterPlayBtn.hidden = true;
  }
}

function updateFrameStepVisibility(show = Boolean(el.videoPlayer && !el.videoPlayer.hidden && el.videoPlayer.paused)) {
  const visible = Boolean(show && el.videoPlayer && !el.videoPlayer.hidden);
  [el.ctrlFramePrev, el.ctrlFrameNext, el.shortsFramePrev, el.shortsFrameNext].forEach((button) => {
    if (button) button.hidden = !visible;
  });
}

function seekRelative(deltaSeconds) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const duration = playerTimeline().duration || Infinity;
  const target = Math.max(0, Math.min(duration, playerTimeline().currentTime + deltaSeconds));
  setPlayerCurrentTime(el.videoPlayer, target, 'relative');
  showSeekHint(deltaSeconds);
  updateVideoProgress();
  resetControlsTimer();
}

// Repeated seeks in one direction accumulate into a single side hint ("20초") instead of stacking toasts.
let seekHintTimer = null;
let seekHintTotal = 0;
function showSeekHint(deltaSeconds) {
  const forward = deltaSeconds > 0;
  const hint = forward ? el.seekHintRight : el.seekHintLeft;
  const other = forward ? el.seekHintLeft : el.seekHintRight;
  if (!hint) return;
  seekHintTotal = Math.sign(seekHintTotal) === Math.sign(deltaSeconds) && hint.classList.contains('show')
    ? seekHintTotal + deltaSeconds : deltaSeconds;
  other?.classList.remove('show');
  const label = hint.querySelector('span');
  if (label) label.textContent = `${Math.abs(seekHintTotal)}초`;
  hint.classList.remove('pulse');
  void hint.offsetWidth;
  hint.classList.add('show', 'pulse');
  clearTimeout(seekHintTimer);
  seekHintTimer = setTimeout(() => {
    seekHintTimer = null;
    hint.classList.remove('show', 'pulse');
  }, 650);
}

function mediaSeekTargetTolerance() {
  const frameDuration = Number(state.frameDuration);
  const frameTolerance = Number.isFinite(frameDuration) && frameDuration > 0
    ? frameDuration * 2
    : DEFAULT_FRAME_DURATION * 2;
  return Math.min(1, Math.max(0.25, frameTolerance));
}

function mediaSeekTimesMatch(actual, target, tolerance = mediaSeekTargetTolerance()) {
  const actualTime = Number(actual);
  const targetTime = Number(target);
  const allowed = Number(tolerance);
  return Number.isFinite(actualTime) && Number.isFinite(targetTime)
    && Number.isFinite(allowed) && allowed >= 0
    && Math.abs(actualTime - targetTime) <= allowed;
}

function isCurrentMediaSeekOwner(owner = mediaSeekWatchdog) {
  return Boolean(
    owner && mediaSeekWatchdog === owner && !owner.terminalClaimed
    && mediaSeekGeneration === owner.seekGeneration
    && state.selected?.id === owner.fileId
    && state.mediaSession === owner.session
    && state.playbackSession === owner.playbackSession
    && state.accountId === owner.accountId
    && state.authAccountKey === owner.authAccountKey
    && state.driveSessionGeneration === owner.accountGeneration
    && state.mediaAttempt === owner.sourceAttempt
    && mediaSourceGeneration === owner.sourceGeneration
    && isCurrentMediaEvent(owner.video)
  );
}

function canOwnMediaSeek(video = el.videoPlayer) {
  return Boolean(
    video && !video.hidden && isCurrentMediaEvent(video)
    && state.selected?.mimeType?.startsWith('video/')
    && isMediaFrameWatchdogSource()
    && el.playerSheet?.hidden !== true
  );
}

function canRunMediaSeekWatchdog(owner = mediaSeekWatchdog) {
  return Boolean(
    isCurrentMediaSeekOwner(owner)
    && state.mediaTransportVerified === true
    && state.mediaTransportStarted === true
    && owner.video.paused === false && owner.video.ended !== true
    && document.visibilityState !== 'hidden'
    && navigator.onLine !== false
    && !isSeekingPointer
    && el.playerSheet?.hidden !== true
  );
}

function settleMediaSeekGeneration(generation = mediaSeekGeneration) {
  const numericGeneration = Number(generation);
  if (Number.isSafeInteger(numericGeneration) && numericGeneration > mediaSeekSettledGeneration) {
    mediaSeekSettledGeneration = numericGeneration;
  }
}

function clearMediaSeekWatchdog(_reason = '') {
  completedMediaSeekPresentation = null;
  const owner = mediaSeekWatchdog;
  mediaSeekWatchdog = null;
  if (owner) settleMediaSeekGeneration(owner.seekGeneration);
  else if (state.isSeeking) settleMediaSeekGeneration();
  state.isSeeking = false;
  if (owner?.timerId != null) clearTimeout(owner.timerId);
  if (owner) {
    owner.timerId = null;
    owner.activeSince = null;
  }
}

function suspendMediaSeekWatchdog(owner) {
  if (!owner || mediaSeekWatchdog !== owner) return;
  if (owner.timerId != null) {
    clearTimeout(owner.timerId);
    owner.timerId = null;
    if (Number.isFinite(owner.activeSince)) {
      const elapsed = Math.max(0, mediaDiagnosticTimestamp() - owner.activeSince);
      owner.remainingMs = Math.max(0, owner.remainingMs - elapsed);
    }
  }
  owner.activeSince = null;
}

function failMediaSeekWatchdog(owner) {
  if (!isCurrentMediaSeekOwner(owner)) return;
  owner.terminalClaimed = true;
  settleMediaSeekGeneration(owner.seekGeneration);
  mediaSeekWatchdog = null;
  if (owner.timerId != null) clearTimeout(owner.timerId);
  owner.timerId = null;
  owner.activeSince = null;
  state.isSeeking = false;
  emitMediaDiagnosticStage('seek-no-progress', {
    seekGeneration: owner.seekGeneration,
    targetTime: owner.targetTime,
    currentTime: Number(owner.video.currentTime) || 0,
    attempt: owner.sourceAttempt,
    terminal: true
  }, owner.session);

  if (owner.sourceAttempt === 'blob' || owner.sourceAttempt === 'q1') {
    clearDirectMediaSources();
    state.mediaAttempt = 'failed';
    showMediaError(
      '원본 파일은 준비됐지만 선택한 위치의 영상 프레임을 표시하지 못했습니다. 다시 시도하거나 호환 재생을 직접 선택할 수 있습니다.',
      { title: '원본 영상 탐색이 멈췄습니다' }
    );
    if (el.compatPlayerButton) el.compatPlayerButton.hidden = false;
    return;
  }

  void recoverFromMediaProxyError({
    type: 'MEDIA_SEEK_NO_PROGRESS',
    fileId: owner.fileId,
    sessionId: String(owner.session),
    mediaSession: String(owner.session),
    status: 504,
    category: 'timeout',
    driveReason: 'seekNoProgress',
    seekGeneration: owner.seekGeneration,
    targetTime: owner.targetTime
  }).catch((error) => reportAppFailure('seek-recovery', error, 'warn'));
}

function scheduleMediaSeekWatchdog(owner) {
  if (!isCurrentMediaSeekOwner(owner) || owner.timerId != null) return;
  const delay = Math.max(0, owner.remainingMs);
  owner.activeSince = mediaDiagnosticTimestamp();
  owner.timerId = window.setTimeout(() => {
    owner.timerId = null;
    if (!isCurrentMediaSeekOwner(owner)) return;
    if (!canRunMediaSeekWatchdog(owner)) {
      owner.activeSince = null;
      return;
    }
    const elapsed = Math.max(0, mediaDiagnosticTimestamp() - owner.activeSince);
    owner.remainingMs = Math.max(0, owner.remainingMs - elapsed);
    owner.activeSince = null;
    if (owner.remainingMs > 0) {
      scheduleMediaSeekWatchdog(owner);
      return;
    }
    failMediaSeekWatchdog(owner);
  }, delay);
}

function syncMediaSeekWatchdog() {
  const owner = mediaSeekWatchdog;
  if (!owner) return false;
  if (!isCurrentMediaSeekOwner(owner)) {
    clearMediaSeekWatchdog('stale-owner');
    return false;
  }
  updateMediaSeekPresentationTimeline(owner);
  if (!canRunMediaSeekWatchdog(owner)) {
    suspendMediaSeekWatchdog(owner);
    return false;
  }
  scheduleMediaSeekWatchdog(owner);
  return true;
}

function beginMediaSeekIntent(video, targetTime, origin = 'native') {
  const numericTarget = Number(targetTime);
  clearMediaSeekWatchdog('superseded');
  const seekGeneration = ++mediaSeekGeneration;
  clearMediaFrameWatchdog('seeking');
  cancelVideoFrameSampling();
  state.isSeeking = true;
  state.lastPresentedMediaTime = null;
  if (el.mediaLoading?.hidden === false) setMediaLoadingProgress(null);
  recordMediaDiagnosticSeekStart(video, seekGeneration, numericTarget);

  if (Number.isFinite(numericTarget) && canOwnMediaSeek(video)) {
    mediaSeekWatchdog = {
      video,
      fileId: state.selected.id,
      session: state.mediaSession,
      playbackSession: state.playbackSession,
      accountId: state.accountId,
      authAccountKey: state.authAccountKey,
      accountGeneration: state.driveSessionGeneration,
      sourceAttempt: state.mediaAttempt,
      sourceGeneration: mediaSourceGeneration,
      seekGeneration,
      origin,
      targetTime: numericTarget,
      effectiveTarget: null,
      presentationTimelineAt: null,
      presentationTimelineRate: 0,
      presentationAdvance: 0,
      tolerance: mediaSeekTargetTolerance(),
      seekedSeen: false,
      frameSeen: false,
      presentedMediaTime: null,
      frameConfidence: '',
      fallbackSeen: false,
      remainingMs: MEDIA_SEEK_COMPLETION_TIMEOUT_MS,
      activeSince: null,
      timerId: null,
      terminalClaimed: false
    };
    emitMediaDiagnosticStage('seek-watchdog-armed', {
      seekGeneration,
      targetTime: numericTarget,
      origin
    }, state.mediaSession);
    syncMediaSeekWatchdog();
  }
  beginVideoFrameSampling();
  return seekGeneration;
}

function observeNativeMediaSeeking(video) {
  if (!isCurrentMediaEvent(video)) return null;
  const targetTime = Number(video.currentTime);
  state.isSeeking = true;
  state.lastPresentedMediaTime = null;
  clearMediaFrameWatchdog('seeking');
  const owner = mediaSeekWatchdog;
  if (
    isCurrentMediaSeekOwner(owner)
    && mediaSeekTimesMatch(targetTime, owner.targetTime, owner.tolerance)
  ) {
    syncMediaSeekWatchdog();
    return owner.seekGeneration;
  }
  return beginMediaSeekIntent(video, targetTime, 'native');
}

function playerTimeline(video = el.videoPlayer) {
  const mapping = q1Playback?.kind === 'general' && q1Playback.player?.stats()?.mapping;
  const duration = mapping ? mapping.sourceEnd - mapping.sourceOrigin : Number(video?.duration);
  const raw = mapping ? q1Playback.player.sourceTime() - mapping.sourceOrigin : Number(video?.currentTime);
  return { mapping, duration, currentTime: Math.max(0, Math.min(Number.isFinite(duration) ? duration : Infinity, raw || 0)) };
}

function retirePlayerTracks() {
  const owner = playerTracksOwner;
  playerTracksOwner = null;
  if (el.playerTracksDialog?.open) el.playerTracksDialog.close();
  if (!owner) return playerTracksRetirement;
  owner.controller.abort();
  owner.presentation?.clear();
  const retirement = (async () => {
    const results = [];
    if (owner.source) results.push(await owner.source.abort());
    if (owner.presentation) results.push(await owner.presentation.dispose());
    else if (owner.subtitles) results.push(await owner.subtitles.dispose());
    await owner.loading;
    return {settled: owner.cleanupOk && results.every(result => result?.settled === true)};
  })().catch(() => ({settled: false}));
  playerTracksRetirement = retirement;
  playerTracksRetirementResult = null;
  void retirement.then(result => { if (playerTracksRetirement === retirement) playerTracksRetirementResult = result; });
  return playerTracksRetirement;
}

function refreshPlayerSubtitles() { void playerTracksOwner?.presentation?.update(); }

function cancelPlayerTrackDiscovery() {
  // Completed subtitle presentation remains owned by the playing file. A
  // dismissed discovery must stop its requests and cannot publish late UI.
  if (!el.playerTracksDialog.open && playerTracksOwner?.checking) void retirePlayerTracks();
}

async function retryPlayerTracks() {
  const owner = playerTracksOwner;
  if (!owner || owner.checking || owner.switching || !owner.cleanupOk) return;
  const {file, session} = owner;
  const retired = await retirePlayerTracks();
  if (retired.settled && state.selected?.id === file.id && state.mediaSession === session) await openPlayerTracks();
}

function setPlayerTracksStatus(owner, phase, message, retry = false) {
  owner.phase = phase;
  el.playerTracksStatus.textContent = message;
  if (el.playerTracksStatus.dataset) el.playerTracksStatus.dataset.phase = phase;
  if (el.playerTracksRetry) {
    el.playerTracksRetry.hidden = !retry;
    el.playerTracksRetry.disabled = !owner.cleanupOk || owner.checking;
  }
}

function playerTracksFailureMessage(error) {
  const code = error?.message || '';
  if (/TIMEOUT/.test(code)) return '확인이 30초 안에 끝나지 않았습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
  if (/CONTENT_DRIFT|METADATA_IDENTITY/.test(code)) return '확인 중 원본 파일이 변경됐습니다. 다시 시도해 주세요.';
  if (/CLEANUP_UNSETTLED|CLEANUP_UNCONFIRMED/.test(code)) return '이전 확인 요청을 종료하지 못했습니다. 플레이어를 닫고 다시 열어 주세요.';
  if (/IDENTITY_UNAVAILABLE/.test(code)) return '원본 파일의 버전을 확인할 수 없습니다. 다시 시도해 주세요.';
  return '음성·자막 목록을 읽지 못했습니다. 네트워크 상태를 확인한 뒤 다시 시도해 주세요.';
}

async function awaitPlayerTrackModule(owner, pending) {
  const signal = owner.controller.signal;
  let cancel;
  try {
    return await Promise.race([pending, new Promise((_, reject) => {
      cancel = () => reject(new Error('GENERAL_CANCELLED'));
      signal.addEventListener('abort', cancel, {once:true});
      if (signal.aborted) cancel();
    })]);
  } finally { signal.removeEventListener('abort', cancel); }
}

async function openPlayerTracks() {
  if (!state.selected || el.videoPlayer.hidden || el.playerSheet.hidden) return;
  if (el.playerMoreMenu) el.playerMoreMenu.open = false;
  collapseShortsExpand();
  el.playerTracksDialog.showModal();
  if (playerTracksOwner?.current()) return;
  if (playerTracksOwner) void retirePlayerTracks();
  if (!el.playerTracksDialog.open) el.playerTracksDialog.showModal();
  el.playerAudioTrack.replaceChildren(new Option('현재 원본 음성', ''));
  el.playerSubtitleTrack.replaceChildren(new Option('끔', ''));
  el.playerAudioTrack.disabled = el.playerSubtitleTrack.disabled = true;
  const file = state.selected, session = state.mediaSession, account = state.authAccountKey;
  const accountGeneration = state.driveSessionGeneration, swController = navigator.serviceWorker?.controller;
  const controller = new AbortController();
  const activeAudio = q1Playback?.fileId === file.id && q1Playback.session === session
    && q1Playback.account === account && q1Playback.accountGeneration === accountGeneration
    && q1Playback.swController === swController && q1Playback.swGeneration === mediaSourceGeneration
    && !q1Playback.controller.signal.aborted ? q1Playback : null;
  const owner = {file, session, account, accountGeneration, controller, source: null,
    subtitles: null, presentation: null, cleanupOk: true, checking: true,
    identity: activeAudio?.routeIdentity ? {...activeAudio.routeIdentity} : null,
    selectedAudioTrackId: activeAudio?.selectedAudioTrackId,
    nativeColorObservation: activeAudio?.nativeColorObservation || null};
  owner.visible = () => playerTracksOwner === owner
    && state.selected?.id === file.id && state.mediaSession === session
    && state.authAccountKey === account && state.driveSessionGeneration === accountGeneration
    && navigator.serviceWorker?.controller === swController && !el.playerSheet.hidden;
  owner.current = () => owner.visible() && !controller.signal.aborted
    && (!owner.checking || el.playerTracksDialog.open);
  playerTracksOwner = owner;
  setPlayerTracksStatus(owner, 'checking', '음성·자막 목록을 확인하는 중입니다.');
  // Optional discovery has a total wall, rather than a fresh timeout for every
  // metadata/range request. It never times a selected subtitle's playback life.
  let discoveryTimer;
  const readIdentity = async () => {
    const {openDriveQ1Source} = await awaitPlayerTrackModule(owner, import('../media/drive-source.mjs'));
    if (!owner.current()) throw new Error('Q1_SOURCE_STALE');
    const source = await openDriveQ1Source({fileId: file.id, accountKey: account, accountGeneration,
      allowCorsHiddenRange: true,
      signal: controller.signal, isCurrent: owner.current,
      readMetadata: ({signal}) => readSourceRevisionMetadata(file, signal),
      // This independent metadata/caption reader must survive a Q1 seek's SW
      // generation retirement without sharing or retiring its playback source.
      readRange: ({range, signal}) => {
        const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
        url.searchParams.set('alt', 'media'); url.searchParams.set('supportsAllDrives', 'true');
        return driveFetch(url.href, {signal, driveNoRetry: true, driveMaxRateAttempts: 1,
          headers: {Range: range, ...(file.resourceKey ? {'X-Goog-Drive-Resource-Keys': `${file.id}/${file.resourceKey}`} : {})}});
      }
    });
    const expected = owner.identity || q0PinnedSource?.descriptor;
    if (expected && ['headRevisionId', 'size', 'mimeType', 'modifiedTime']
      .some(key => source.identity[key] !== expected[key])
      || expected?.sha256Checksum && source.identity.sha256Checksum !== expected.sha256Checksum) {
      const cleanup = await source.abort(); owner.cleanupOk &&= cleanup.settled;
      throw new Error('Q1_SOURCE_CONTENT_DRIFT');
    }
    owner.identity ||= {...source.identity};
    return source;
  };
  owner.loading = (async () => {
    try {
      const retired = await playerTracksRetirement;
      if (!owner.current()) return;
      if (!retired.settled) throw new Error('GENERAL_TRACK_CLEANUP_UNSETTLED');
      discoveryTimer = setTimeout(() => { owner.timedOut = true; controller.abort(); }, 30000);
      const {probePinnedGeneralTracks} = await awaitPlayerTrackModule(owner, import('../media/general-tracks.mjs'));
      owner.source = await readIdentity();
      owner.inventory = await probePinnedGeneralTracks(owner.source, {signal: controller.signal, isCurrent: owner.current});
      owner.reason = owner.inventory.reason || null;
      owner.identity = {...owner.inventory.identity};
      owner.cleanupOk &&= owner.inventory.cleanup?.settled === true;
      owner.source = null;
      if (!owner.current()) {
        if (owner.timedOut) throw new Error('TRACK_DISCOVERY_TIMEOUT');
        return;
      }
      if (!owner.cleanupOk) throw new Error('GENERAL_TRACK_CLEANUP_UNSETTLED');
      el.playerAudioTrack.replaceChildren();
      for (const track of owner.inventory.audioTracks) {
        const option = new Option(`${track.label} · ${track.codec}${track.route === 'unqualified' ? ' · 선택 지원 안 됨' : ''}`, String(track.trackId));
        option.disabled = track.route === 'unqualified';
        el.playerAudioTrack.append(option);
      }
      if (!owner.inventory.audioTracks.length) el.playerAudioTrack.append(new Option('선택 가능한 음성 없음', ''));
      else {
        if (owner.selectedAudioTrackId !== undefined && !owner.inventory.audioTracks.some(track => track.trackId === owner.selectedAudioTrackId))
          throw new Error('GENERAL_AUDIO_SELECTION_MISSING');
        const currentTrackId = owner.selectedAudioTrackId ?? owner.inventory.defaultAudioTrackId;
        if (currentTrackId == null) {
          // Metadata-only inventory does not identify the native default track.
          // Keep that distinction visible instead of selecting a guessed track.
          el.playerAudioTrack.append(new Option('현재 원본 음성 · 기본 트랙 미확인', ''));
          el.playerAudioTrack.value = '';
        } else el.playerAudioTrack.value = String(currentTrackId);
      }
      el.playerAudioTrack.disabled = !owner.inventory.audioTracks.some(track => track.route !== 'unqualified');
      if (owner.inventory.kind !== 'iso') {
        setPlayerTracksStatus(owner, 'unsupported', '이 원본 형식의 음성·자막 선택을 지원하지 않습니다.');
        return;
      }
      if (!owner.inventory.subtitleTracks?.length) {
        const audioPresent = owner.inventory.audioTracks.length > 0;
        setPlayerTracksStatus(owner, !audioPresent ? 'empty' : el.playerAudioTrack.disabled ? 'unsupported' : 'ready',
          !audioPresent ? '원본에 선택 가능한 음성·자막 트랙이 없습니다.'
            : el.playerAudioTrack.disabled ? '음성 목록을 확인했습니다. 이 파일의 음성 전환은 지원하지 않으며, 원본에 자막 트랙은 없습니다.'
              : '음성 목록을 확인했습니다. 원본에 자막 트랙은 없습니다.');
        return;
      }
      const [{createPinnedSubtitleTrack}, {createSubtitlePresentation}] = await awaitPlayerTrackModule(owner, Promise.all([
        import('../media/subtitle-track.mjs'), import('../media/subtitle-presentation.mjs')]));
      owner.source = await readIdentity();
      owner.subtitles = await createPinnedSubtitleTrack(owner.source, {signal: controller.signal, isCurrent: owner.current,
        metadata: owner.inventory.subtitleMetadata});
      owner.inventory.subtitleMetadata = null;
      owner.source = null;
      if (!owner.current()) {
        owner.cleanupOk &&= (await owner.subtitles.dispose()).settled;
        if (owner.timedOut) throw new Error('TRACK_DISCOVERY_TIMEOUT');
        return;
      }
      for (const track of owner.subtitles.tracks) {
        const option = new Option(`${track.label || track.language || '자막'} (${track.trackId})${track.supported ? '' : ' · 선택 지원 안 됨'}`, String(track.trackId));
        option.disabled = !track.supported; el.playerSubtitleTrack.append(option);
      }
      el.playerSubtitleTrack.disabled = !owner.subtitles.tracks.some(track => track.supported);
      if (el.playerSubtitleTrack.disabled) {
        owner.cleanupOk &&= (await owner.subtitles.dispose()).settled; owner.subtitles = null;
        if (owner.timedOut) throw new Error('TRACK_DISCOVERY_TIMEOUT');
        if (!owner.current()) return;
        if (!owner.cleanupOk) throw new Error('GENERAL_TRACK_CLEANUP_UNSETTLED');
      } else {
        if (typeof el.videoPlayer.addTextTrack !== 'function' || typeof globalThis.VTTCue !== 'function') {
          owner.cleanupOk &&= (await owner.subtitles.dispose()).settled; owner.subtitles = null;
          if (owner.timedOut) throw new Error('TRACK_DISCOVERY_TIMEOUT');
          if (!owner.current()) return;
          if (!owner.cleanupOk) throw new Error('GENERAL_TRACK_CLEANUP_UNSETTLED');
          el.playerSubtitleTrack.disabled = true;
          setPlayerTracksStatus(owner, 'unsupported', '이 브라우저는 선택한 텍스트 자막 표시를 지원하지 않습니다.');
          return;
        }
        playerSubtitleTextTrack ||= el.videoPlayer.addTextTrack('subtitles', '선택한 자막');
        playerSubtitleTextTrack.mode = 'disabled';
        owner.presentation = createSubtitlePresentation({reader: owner.subtitles, textTrack: playerSubtitleTextTrack,
          isCurrent: owner.current, getClock: () => {
            const mapping = q1Playback?.kind === 'general' && q1Playback.player?.stats()?.mapping;
            return {ready: !el.videoPlayer.hidden && state.mediaTransportVerified && (!q1Playback || !!mapping),
              sourceTime: mapping ? q1Playback.player.sourceTime() : el.videoPlayer.currentTime,
              elementTime: el.videoPlayer.currentTime};
          }, onError: () => {
            if (owner.current()) el.playerTracksStatus.textContent = '선택한 자막 읽기가 중단됐습니다. 다른 음성으로 전환하지 않습니다.';
          }});
      }
      setPlayerTracksStatus(owner, owner.subtitles ? 'ready' : 'unsupported', owner.subtitles
        ? '음성은 선택한 언어를 유지합니다. 자막은 텍스트만 표시합니다.' : '원본에 자막 트랙이 있지만, 이 자막 형식의 선택을 지원하지 않습니다.');
    } catch (error) {
      owner.reason = owner.timedOut ? 'TRACK_DISCOVERY_TIMEOUT' : error?.message || 'TRACK_DISCOVERY_FAILED';
      if (error?.cleanup?.settled === false) owner.cleanupOk = false;
      if (owner.source) { owner.cleanupOk &&= (await owner.source.abort()).settled; owner.source = null; }
      if (owner.visible() && el.playerTracksDialog.open) {
        const unsupported = /^SUBTITLE_.*(?:UNSUPPORTED|LIMIT)$/.test(error?.message || '');
        if (!unsupported) el.playerAudioTrack.disabled = el.playerSubtitleTrack.disabled = true;
        owner.checking = false;
        setPlayerTracksStatus(owner, unsupported ? 'unsupported' : 'failed', unsupported
          ? '원본의 자막 목록은 확인했지만, 이 자막 형식이나 크기는 선택을 지원하지 않습니다.'
          : playerTracksFailureMessage(owner.timedOut ? new Error('TRACK_DISCOVERY_TIMEOUT') : error), !unsupported);
      }
    } finally {
      clearTimeout(discoveryTimer); owner.checking = false;
      if (owner.inventory) owner.inventory.subtitleMetadata = null;
      if (owner.visible() && el.playerTracksRetry) el.playerTracksRetry.disabled = !owner.cleanupOk;
    }
  })();
  await owner.loading;
}

async function observePinnedNativePlayerColor(file, session) {
  const native = q0Playback, pin = q0PinnedSource, video = el.videoPlayer;
  const current = () => Boolean(native && pin && pin.descriptor?.fileId === file.id
    && session === state.mediaSession && native.session === session
    && isCurrentQ0Playback(native, file.id, native.swGeneration)
    && navigator.serviceWorker?.controller === native.swController && q0PinnedSource === pin
    && video === el.videoPlayer && !video.hidden && isCurrentMediaEvent(video)
    && hasVerifiedOriginalTransport() && state.mediaDecodeVerified === true
    && video.currentSrc === buildPinnedMediaUrl(file));
  if (typeof globalThis.VideoFrame !== 'function' || !current()) return null;
  try {
    const {observeNativeFrameColor} = await import('../media/native-color.mjs');
    if (!current()) return null;
    // This records the native resource's observed interpretation, never a
    // guessed declaration about the original. The frame is closed immediately.
    return observeNativeFrameColor({video, identity: pin.descriptor, isCurrent: current});
  } catch (_) { return null; }
}

async function selectPlayerAudioTrack() {
  const owner = playerTracksOwner, trackId = Number(el.playerAudioTrack.value);
  if (!owner?.current() || owner.switching || !owner.cleanupOk) return;
  const track = owner.inventory?.audioTracks.find(item => item.trackId === trackId && item.route !== 'unqualified');
  if (!track) return;
  const snapshot = capturePlaybackSnapshot();
  owner.selectedAudioTrackId = trackId; owner.switching = true;
  el.playerAudioTrack.disabled = true;
  el.playerTracksStatus.textContent = '선택한 음성으로 전환하는 중입니다.';
  if (el.playerTracksDialog.open) el.playerTracksDialog.close();
  // Cancel old Q1 before constructing its successor; no live-owner overwrite.
  try {
    const observed = await observePinnedNativePlayerColor(owner.file, owner.session);
    if (!owner.current()) return;
    if (observed) owner.nativeColorObservation = observed;
    const old = q1Playback; q1Playback = null;
    const retired = await (old ? retireQ1Playback(old) : q1Retirement);
    if (!owner.current()) return;
    if (!retired.settled) throw new Error('GENERAL_CLEANUP_UNCONFIRMED');
    const started = await tryOriginalTsPlayback(owner.file, owner.session, {general: true, audioCompatibility: track.route === 'q2',
      selectedAudioTrackId: trackId, expectedIdentity: owner.identity, snapshotOverride: snapshot,
      nativeColorObservation: owner.nativeColorObservation});
    if (!started) throw new Error('GENERAL_MSE_UNAVAILABLE');
  } catch (_) {
    if (owner.current()) {
      state.mediaAttempt = 'failed';
      showMediaError('선택한 음성으로 안전하게 전환하지 못했습니다. 다른 언어로 대체하지 않습니다.', {showRetry: false});
    }
  } finally {
    owner.switching = false;
    if (owner.current()) el.playerAudioTrack.disabled = !owner.cleanupOk;
  }
}

function setPlayerCurrentTime(video, targetTime, origin = 'app') {
  if (!video || video.hidden || !isCurrentMediaEvent(video)) return false;
  const { duration, currentTime, mapping } = playerTimeline(video);
  const numericTarget = Number(targetTime);
  if (!Number.isFinite(numericTarget)) return false;
  const target = Number.isFinite(duration) && duration >= 0
    ? Math.max(0, Math.min(duration, numericTarget))
    : Math.max(0, numericTarget);
  if (Math.abs(currentTime - target) < 0.0001) return false;
  if (state.mediaAttempt === 'q1' && q1Playback?.player) {
    q1Playback.player.seek(mapping ? Math.min(mapping.sourceEnd - 0.000001, mapping.sourceOrigin + target) : target, { autoplay: !video.paused }).catch(() => {});
    return true;
  }
  beginMediaSeekIntent(video, target, origin);
  try {
    video.currentTime = target;
  } catch (error) {
    clearMediaSeekWatchdog('assignment-failed');
    state.isSeeking = false;
    throw error;
  }
  return true;
}

function updateMediaSeekPresentationTimeline(owner) {
  if (!owner?.seekedSeen) return;
  const now = mediaDiagnosticTimestamp();
  if (Number.isFinite(owner.presentationTimelineAt)) {
    owner.presentationAdvance += Math.max(0, now - owner.presentationTimelineAt)
      / 1000 * owner.presentationTimelineRate;
  }
  owner.presentationTimelineAt = now;
  const rate = Number(owner.video.playbackRate);
  owner.presentationTimelineRate = owner.video.paused || owner.video.ended
    ? 0 : (Number.isFinite(rate) && rate > 0 ? rate : 1);
}

function mediaSeekPresentationMatches(owner, mediaTime) {
  const target = Number.isFinite(owner.effectiveTarget) ? owner.effectiveTarget : owner.targetTime;
  if (mediaSeekTimesMatch(mediaTime, target, owner.tolerance)) return true;
  // A playing seek can advance before the first sampled decoded frame arrives.
  // Preserve both scene identity and a plausible timeline; currentTime alone
  // is never displayed-frame proof. Paused seeks still require the target frame.
  if (!owner.seekedSeen || !canRunMediaSeekWatchdog(owner)
    || state.isSeeking || owner.video.seeking === true) return false;
  updateMediaSeekPresentationTimeline(owner);
  const frameTime = Number(mediaTime);
  return Number.isFinite(frameTime)
    && mediaSeekTimesMatch(frameTime, owner.video.currentTime, owner.tolerance)
    && frameTime >= target - owner.tolerance
    && frameTime <= target + owner.presentationAdvance + owner.tolerance;
}

function completeMediaSeekWatchdog(owner) {
  if (
    !isCurrentMediaSeekOwner(owner)
    || !owner.seekedSeen || !owner.frameSeen
    || owner.frameConfidence !== 'decoded-frame'
    || state.isSeeking || owner.video.seeking === true
  ) return false;
  if (!mediaSeekPresentationMatches(owner, owner.presentedMediaTime)) return false;

  const activeElapsedMs = Math.max(
    0,
    MEDIA_SEEK_COMPLETION_TIMEOUT_MS - owner.remainingMs
      + (Number.isFinite(owner.activeSince)
        ? mediaDiagnosticTimestamp() - owner.activeSince
        : 0)
  );
  if (owner.timerId != null) clearTimeout(owner.timerId);
  owner.timerId = null;
  owner.activeSince = null;
  settleMediaSeekGeneration(owner.seekGeneration);
  mediaSeekWatchdog = null;
  completedMediaSeekPresentation = owner;
  completeVideoFramePresentation(owner, 'decoded-frame');
  emitMediaDiagnosticStage('seek-frame', {
    seekGeneration: owner.seekGeneration,
    targetTime: owner.targetTime,
    currentTime: Number(owner.video.currentTime) || 0,
    presentedMediaTime: owner.presentedMediaTime,
    tolerance: owner.tolerance,
    activeElapsedMs,
    confidence: owner.frameConfidence
  }, owner.session);
  syncMediaFrameWatchdog();
  return true;
}

function noteMediaSeeked(
  video,
  expectedSeekGeneration = mediaSeekGeneration,
  { deferCompletion = false } = {}
) {
  const owner = mediaSeekWatchdog;
  if (
    !isCurrentMediaSeekOwner(owner)
    || owner.seekGeneration !== expectedSeekGeneration
    || video !== owner.video || video.seeking === true
    || !mediaSeekTimesMatch(video.currentTime, owner.targetTime, owner.tolerance)
  ) return false;
  if (!owner.seekedSeen) {
    owner.seekedSeen = true;
    owner.effectiveTarget = Number(video.currentTime);
    updateMediaSeekPresentationTimeline(owner);
  }
  if (!deferCompletion) completeMediaSeekWatchdog(owner);
  syncMediaSeekWatchdog();
  return true;
}

function handleVideoSeeked(event) {
  const video = event?.currentTarget;
  if (!isCurrentMediaEvent(video)) return false;
  const owner = mediaSeekWatchdog;
  const ownedSeek = isCurrentMediaSeekOwner(owner);
  if (owner && !ownedSeek) {
    syncMediaSeekWatchdog();
    return false;
  }
  const generation = owner?.seekGeneration || mediaSeekGeneration;
  if (!ownedSeek && generation <= mediaSeekSettledGeneration) return false;
  if (video.seeking !== true) state.isSeeking = false;
  const accepted = ownedSeek
    ? noteMediaSeeked(video, generation, { deferCompletion: true })
    : false;
  if (ownedSeek && !accepted) {
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    return false;
  }
  recordMediaDiagnosticSeekEnd(video, generation, { ownedFrame: ownedSeek });
  if (accepted) completeMediaSeekWatchdog(owner);
  else settleMediaSeekGeneration(generation);
  syncMediaSeekWatchdog();
  syncMediaFrameWatchdog();
  return accepted;
}

function noteMediaSeekFrameProgress(
  video,
  mediaTime,
  confidence = 'decoded-frame',
  expectedSourceGeneration = mediaSourceGeneration,
  expectedSeekGeneration = mediaSeekGeneration
) {
  const owner = mediaSeekWatchdog;
  if (
    !isCurrentMediaSeekOwner(owner)
    || expectedSourceGeneration !== owner.sourceGeneration
    || expectedSeekGeneration !== owner.seekGeneration
    || video !== owner.video
  ) return false;
  const presentedMediaTime = Number(mediaTime);
  if (!mediaSeekPresentationMatches(owner, presentedMediaTime)) return false;
  if (confidence !== 'decoded-frame') {
    if (owner.seekedSeen && !owner.fallbackSeen) {
      owner.fallbackSeen = true;
      emitMediaDiagnosticStage('seek-presentation-fallback', {
        seekGeneration: owner.seekGeneration,
        targetTime: owner.targetTime,
        currentTime: Number(video.currentTime) || 0,
        presentedMediaTime,
        confidence
      }, owner.session);
    }
    return false;
  }
  owner.frameSeen = true;
  owner.presentedMediaTime = presentedMediaTime;
  owner.frameConfidence = confidence;
  return completeMediaSeekWatchdog(owner);
}

function isMediaFrameWatchdogSource() {
  const direct = ['range', 'range-retry'].includes(state.mediaAttempt)
    && [PLAYBACK_MODE.RANGE, PLAYBACK_MODE.SEQUENTIAL].includes(state.mediaPlaybackMode);
  const buffered = state.mediaAttempt === 'blob'
    && [PLAYBACK_MODE.OPFS, PLAYBACK_MODE.MEMORY].includes(state.mediaPlaybackMode);
  const repackaged = state.mediaAttempt === 'q1' && [PLAYBACK_MODE.REPACKAGED, PLAYBACK_MODE.AUDIO_COMPATIBILITY, PLAYBACK_MODE.VIDEO_COMPATIBILITY].includes(state.mediaPlaybackMode);
  return direct || buffered || repackaged;
}

function canWatchMediaFrameProgress(video = el.videoPlayer) {
  return Boolean(
    video && !video.hidden && isCurrentMediaEvent(video)
    && state.selected?.mimeType?.startsWith('video/')
    && isMediaFrameWatchdogSource()
    && state.mediaTransportVerified === true
    && state.mediaTransportStarted === true
    && mediaSeekWatchdog === null
    && video.paused === false && video.ended !== true
    && video.seeking !== true && state.isSeeking !== true
    && document.visibilityState !== 'hidden'
    && navigator.onLine !== false
    && el.playerSheet?.hidden !== true
  );
}

function clearMediaFrameWatchdog(_reason = '') {
  const owner = mediaFrameWatchdog;
  mediaFrameWatchdog = null;
  if (owner?.timerId != null) clearTimeout(owner.timerId);
}

function scheduleMediaFrameWatchdog(owner) {
  if (!owner || mediaFrameWatchdog !== owner || owner.terminalClaimed) return;
  const elapsed = Math.max(0, mediaDiagnosticTimestamp() - owner.lastProgressAt);
  const remaining = Math.max(0, MEDIA_FRAME_NO_PROGRESS_TIMEOUT_MS - elapsed);
  owner.timerId = window.setTimeout(() => {
    owner.timerId = null;
    if (mediaFrameWatchdog !== owner || owner.terminalClaimed) return;
    if (
      state.mediaSession !== owner.session
      || state.selected?.id !== owner.fileId
      || state.mediaAttempt !== owner.sourceAttempt
      || mediaSourceGeneration !== owner.sourceGeneration
    ) {
      clearMediaFrameWatchdog('stale-owner');
      return;
    }
    if (!canWatchMediaFrameProgress(owner.video)) {
      clearMediaFrameWatchdog('inactive');
      return;
    }
    const stalledFor = Math.max(0, mediaDiagnosticTimestamp() - owner.lastProgressAt);
    if (stalledFor < MEDIA_FRAME_NO_PROGRESS_TIMEOUT_MS) {
      scheduleMediaFrameWatchdog(owner);
      return;
    }

    owner.terminalClaimed = true;
    mediaFrameWatchdog = null;
    const reason = owner.frameSeen ? 'playback-frame-no-progress' : 'initial-frame-no-progress';
    emitMediaDiagnosticStage('frame-no-progress', {
      reason,
      attempt: owner.sourceAttempt,
      currentTime: Number(owner.video.currentTime) || 0,
      terminal: true
    }, owner.session);

    if (owner.sourceAttempt === 'blob' || owner.sourceAttempt === 'q1') {
      clearDirectMediaSources();
      state.mediaAttempt = 'failed';
      showMediaError(
        '원본 파일은 준비됐지만 브라우저의 영상 프레임 진행이 멈췄습니다. 다시 시도하거나 호환 재생을 직접 선택할 수 있습니다.',
        { title: '원본 영상 재생이 멈췄습니다' }
      );
      if (el.compatPlayerButton) el.compatPlayerButton.hidden = false;
      return;
    }

    void recoverFromMediaProxyError({
      type: 'MEDIA_FRAME_NO_PROGRESS',
      fileId: owner.fileId,
      sessionId: String(owner.session),
      mediaSession: String(owner.session),
      status: 504,
      category: 'timeout',
      driveReason: 'frameNoProgress',
      frameReason: reason
    }).catch((error) => reportAppFailure('frame-recovery', error, 'warn'));
  }, remaining);
}

function syncMediaFrameWatchdog() {
  const video = el.videoPlayer;
  if (!canWatchMediaFrameProgress(video)) {
    clearMediaFrameWatchdog('inactive');
    return false;
  }
  const fileId = state.selected.id;
  const session = state.mediaSession;
  const sourceAttempt = state.mediaAttempt;
  if (
    mediaFrameWatchdog
    && mediaFrameWatchdog.video === video
    && mediaFrameWatchdog.fileId === fileId
    && mediaFrameWatchdog.session === session
    && mediaFrameWatchdog.sourceAttempt === sourceAttempt
    && mediaFrameWatchdog.sourceGeneration === mediaSourceGeneration
  ) return true;

  clearMediaFrameWatchdog('superseded');
  const owner = {
    video,
    fileId,
    session,
    sourceAttempt,
    sourceGeneration: mediaSourceGeneration,
    frameSeen: state.mediaDecodeVerified === true,
    lastMediaTime: Number.isFinite(state.lastPresentedMediaTime)
      ? state.lastPresentedMediaTime
      : null,
    lastProgressAt: mediaDiagnosticTimestamp(),
    timerId: null,
    terminalClaimed: false
  };
  mediaFrameWatchdog = owner;
  emitMediaDiagnosticStage('frame-watchdog-armed', {
    reason: owner.frameSeen ? 'playback-progress-required' : 'first-frame-required',
    attempt: sourceAttempt
  }, session);
  scheduleMediaFrameWatchdog(owner);
  return true;
}

function noteMediaFrameProgress(
  video,
  mediaTime,
  confidence = 'decoded-frame',
  expectedSourceGeneration = mediaSourceGeneration,
  expectedSeekGeneration = mediaSeekGeneration,
  expectedSourceAttempt = state.mediaAttempt
) {
  if (
    expectedSourceGeneration !== mediaSourceGeneration
    || expectedSeekGeneration !== mediaSeekGeneration
    || expectedSourceAttempt !== state.mediaAttempt
    || !isCurrentMediaEvent(video)
  ) return false;
  const numericMediaTime = Number(mediaTime);
  if (!Number.isFinite(numericMediaTime)) return false;

  noteViewedVideoPresentation(video, numericMediaTime, confidence);

  state.mediaDecodeVerified = true;
  state.mediaTransportStarted = true;
  const seekCompleted = noteMediaSeekFrameProgress(
    video,
    numericMediaTime,
    confidence,
    expectedSourceGeneration,
    expectedSeekGeneration
  );
  if (state.isSeeking || video.seeking === true) return seekCompleted;
  const owner = mediaFrameWatchdog;
  if (!owner) syncMediaFrameWatchdog();
  const current = mediaFrameWatchdog;
  if (
    !current || current.video !== video
    || current.session !== state.mediaSession
    || current.fileId !== state.selected?.id
    || current.sourceAttempt !== state.mediaAttempt
    || current.sourceGeneration !== mediaSourceGeneration
  ) return seekCompleted;

  const prior = current.lastMediaTime;
  const progressed = !Number.isFinite(prior) || numericMediaTime > prior + 0.0001;
  if (!progressed) return seekCompleted;
  current.lastMediaTime = numericMediaTime;
  current.lastProgressAt = mediaDiagnosticTimestamp();
  current.frameSeen = true;
  if (confidence === 'decoded-frame') state.mediaDecodeVerified = true;
  return seekCompleted || progressed;
}

function cancelVideoFrameSampling() {
  if (state.frameCallbackId != null && el.videoPlayer?.cancelVideoFrameCallback) {
    el.videoPlayer.cancelVideoFrameCallback(state.frameCallbackId);
  }
  state.frameCallbackId = null;
}

function beginVideoFrameSampling() {
  const video = el.videoPlayer;
  if (!video?.requestVideoFrameCallback || video.hidden || state.frameCallbackId != null) return;
  const session = state.mediaSession;
  const fileId = state.selected?.id;
  const sourceAttempt = state.mediaAttempt;
  const sourceGeneration = mediaSourceGeneration;
  const seekGeneration = mediaSeekGeneration;
  let callbackId = null;
  callbackId = video.requestVideoFrameCallback((_now, metadata) => {
    if (state.frameCallbackId === callbackId) state.frameCallbackId = null;
    if (
      state.mediaSession !== session || state.selected?.id !== fileId
      || state.mediaAttempt !== sourceAttempt
      || mediaSourceGeneration !== sourceGeneration
      || mediaSeekGeneration !== seekGeneration
      || !isCurrentMediaEvent(video)
    ) return;
    const mediaTime = Number(metadata?.mediaTime);
    const previous = state.lastPresentedMediaTime;
    if (Number.isFinite(mediaTime) && Number.isFinite(previous)) {
      const delta = mediaTime - previous;
      if (delta >= 1 / 240 && delta <= 1 / 10) {
        state.frameDuration = state.frameDuration * 0.65 + delta * 0.35;
      }
    }
    if (Number.isFinite(mediaTime)) {
      if (!state.isSeeking && video.seeking !== true) state.lastPresentedMediaTime = mediaTime;
      noteMediaFrameProgress(
        video,
        mediaTime,
        'decoded-frame',
        sourceGeneration,
        seekGeneration,
        sourceAttempt
      );
    }
    if (!video.hidden) beginVideoFrameSampling();
  });
  state.frameCallbackId = callbackId;
}

function stepVideoFrame(direction) {
  const video = el.videoPlayer;
  if (!video || video.hidden || !Number.isFinite(playerTimeline(video).currentTime)) return;
  video.pause();
  state.pendingPlay = false;
  const duration = Number.isFinite(playerTimeline(video).duration) ? playerTimeline(video).duration : Infinity;
  const frameDuration = Math.min(1 / 10, Math.max(1 / 240, state.frameDuration || DEFAULT_FRAME_DURATION));
  setPlayerCurrentTime(
    video,
    Math.max(0, Math.min(duration, playerTimeline(video).currentTime + Math.sign(direction || 1) * frameDuration)),
    'frame-step'
  );
  updateVideoProgress();
  showPlayerFeedback(direction < 0 ? '−1 프레임' : '+1 프레임');
}

function toggleMute() {
  if (!el.videoPlayer) return;
  el.videoPlayer.muted = !el.videoPlayer.muted;
  showPlayerFeedback(el.videoPlayer.muted ? '음소거' : `음량 ${Math.round(el.videoPlayer.volume * 100)}%`);
  updateVolumeUI();
}

function onVolumeSliderInput(event) {
  if (!el.videoPlayer) return;
  const val = Number(event.target.value);
  el.videoPlayer.volume = val;
  el.videoPlayer.muted = (val === 0);
  updateVolumeUI();
}

function updateVolumeUI() {
  if (!el.videoPlayer) return;
  const isMuted = el.videoPlayer.muted || el.videoPlayer.volume === 0;
  if (el.ctrlIconVolHigh && el.ctrlIconVolMuted) {
    el.ctrlIconVolHigh.toggleAttribute('hidden', isMuted);
    el.ctrlIconVolMuted.toggleAttribute('hidden', !isMuted);
  }
  if (el.ctrlVolumeSlider) {
    el.ctrlVolumeSlider.value = isMuted ? 0 : el.videoPlayer.volume;
    el.ctrlVolumeSlider.style?.setProperty?.('--volume-fill', `${(isMuted ? 0 : el.videoPlayer.volume) * 100}%`);
  }
}

function toggleSpeedMenu(event) {
  if (event) event.stopPropagation();
  isSpeedMenuOpen = !isSpeedMenuOpen;
  if (el.speedDropdown) el.speedDropdown.hidden = !isSpeedMenuOpen;
  el.ctrlSpeedButton?.setAttribute('aria-expanded', String(isSpeedMenuOpen));
  if (isSpeedMenuOpen) requestAnimationFrame(() => el.speedDropdown?.querySelector('.active')?.focus());
  resetControlsTimer();
}

function closePlayerMoreMenu() {
  if (el.playerMoreMenu) el.playerMoreMenu.open = false;
  isPlayerMoreOpen = false;
}

function closeSpeedMenu() {
  isSpeedMenuOpen = false;
  if (el.speedDropdown) el.speedDropdown.hidden = true;
  el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
}

function setPlaybackSpeed(speed) {
  if (!el.videoPlayer) return;
  stopMobileHoldSpeed();
  el.videoPlayer.playbackRate = speed;
  updateSpeedUI();
  closeSpeedMenu();
  showPlayerFeedback(`${speed}×`);
  resetControlsTimer();
}

function updateSpeedUI() {
  if (!el.videoPlayer) return;
  const speed = el.videoPlayer.playbackRate || 1;
  if (el.ctrlSpeedText) el.ctrlSpeedText.textContent = `${speed}×`;
  (el.speedDropdown?.querySelectorAll('button') || []).forEach(btn => {
    const active = Number(btn.dataset.speed) === speed;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  });
}

function onDocumentClickForSpeedMenu(event) {
  if (isSpeedMenuOpen && !el.speedMenuWrap?.contains(event.target)) {
    closeSpeedMenu();
  }
  if (isPlayerMoreOpen && !el.playerMoreMenu?.contains(event.target)) {
    closePlayerMoreMenu();
    resetControlsTimer();
  }
}

function onSpeedMenuKeyDown(event) {
  if (['Escape', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    event.stopPropagation();
  }
  const buttons = el.speedButtons || [];
  const index = buttons.indexOf(event.currentTarget);
  if (event.key === 'Escape') {
    if (el.mobileShortsOverlay?.classList.contains('expanded')) {
      event.preventDefault();
      collapseShortsExpand();
      el.shortsMoreBtn?.focus();
      return;
    }
    if (isPlayerMoreOpen) {
      closePlayerMoreMenu();
      resetControlsTimer();
      return;
    }
    event.preventDefault();
    closeSpeedMenu();
    el.ctrlSpeedButton?.focus();
    return;
  }
  if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
  event.preventDefault();
  const next = event.key === 'ArrowDown'
    ? (index + 1) % buttons.length
    : (index - 1 + buttons.length) % buttons.length;
  buttons[next]?.focus();
}

function onVideoTimeUpdate() {
  if (isSeekingPointer) return;
  const playbackTime = Number(el.videoPlayer?.currentTime);
  const pendingSeekFallback = Boolean(
    mediaSeekWatchdog
    && mediaSeekWatchdog.video === el.videoPlayer
    && mediaSeekWatchdog.seekedSeen
  );
  if (
    typeof el.videoPlayer?.requestVideoFrameCallback !== 'function'
    && !state.isSeeking && el.videoPlayer?.seeking !== true
    && (playbackTime > 0 || pendingSeekFallback)
  ) {
    noteMediaFrameProgress(el.videoPlayer, playbackTime, 'playback-clock');
  }
  if (mediaDiagnosticTrace && !mediaDiagnosticTrace.playbackProgressSeen && playbackTime > 0) {
    mediaDiagnosticTrace.playbackProgressSeen = true;
    emitMediaDiagnosticStage('playback-progress', {
      currentTime: Number(el.videoPlayer.currentTime) || 0
    });
  }
  updateVideoProgress();
}

function onVideoProgressUpdate(timeline = null) {
  updateNativeLoadingProgress();
  if (!el.videoPlayer || !el.seekBarBuffered) return;
  const { duration, mapping } = timeline || playerTimeline();
  if (!duration || duration <= 0) return;
  const buffered = el.videoPlayer.buffered;
  if (buffered.length > 0) {
    const end = buffered.end(buffered.length - 1) + (mapping ? mapping.commonShift - mapping.sourceOrigin : 0);
    const bufferedRatio = Math.min(1, Math.max(0, end / duration));
    const transform = `scaleX(${bufferedRatio})`;
    if (el.seekBarBuffered.style.transform !== transform) el.seekBarBuffered.style.transform = transform;
  }
}

function updateVideoProgress() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const timeline = playerTimeline();
  const currentTime = timeline.currentTime || 0;
  const duration = Number.isFinite(timeline.duration) ? timeline.duration : 0;
  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;
  const transform = `scaleX(${ratio})`;
  const currentLabel = formatPlayerTime(currentTime);
  const durationLabel = formatPlayerTime(duration);

  if (el.seekBarPlayed && el.seekBarPlayed.style.transform !== transform) el.seekBarPlayed.style.transform = transform;
  if (el.seekBarThumb) {
    const position = `${ratio * 100}%`;
    if (el.seekBarThumb.style.getPropertyValue?.('--seek-position') !== position) {
      el.seekBarThumb.style.setProperty('--seek-position', position);
    }
  }
  if (el.mobileShortsProgressBar && el.mobileShortsProgressBar.style.transform !== transform) el.mobileShortsProgressBar.style.transform = transform;
  if (el.ctrlCurrentTime && el.ctrlCurrentTime.textContent !== currentLabel) el.ctrlCurrentTime.textContent = currentLabel;
  if (el.ctrlTotalTime && el.ctrlTotalTime.textContent !== durationLabel) el.ctrlTotalTime.textContent = durationLabel;
  if (el.mobileCurrentTime && el.mobileCurrentTime.textContent !== currentLabel) el.mobileCurrentTime.textContent = currentLabel;
  if (el.mobileTotalTime && el.mobileTotalTime.textContent !== durationLabel) el.mobileTotalTime.textContent = durationLabel;
  const attributes = { 'aria-valuenow': String(Math.round(Math.min(currentTime, duration))),
    'aria-valuemax': String(Math.round(duration)), 'aria-valuetext': `${currentLabel} / ${durationLabel}` };
  [el.seekBarContainer, el.mobileShortsProgressTrack].filter(Boolean).forEach((track) => {
    for (const [name, value] of Object.entries(attributes)) {
      if (track.getAttribute?.(name) !== value) track.setAttribute(name, value);
    }
  });
  onVideoProgressUpdate(timeline);
}

function getSeekRatio(event) {
  const rect = el.seekBarContainer.getBoundingClientRect();
  const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
  const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  return rect.width > 0 ? clampedX / rect.width : 0;
}

function onSeekPointerDown(event) {
  beginPointerSeek(event, el.seekBarContainer, true);
}

function beginPointerSeek(event, track, showTooltip = false) {
  const video = el.videoPlayer;
  const duration = playerTimeline(video).duration;
  if (!track || !video || video.hidden || !Number.isFinite(duration) || duration <= 0
    || event.isPrimary === false || (event.button != null && event.button !== 0)) return;
  activeSeekCleanup?.();
  const session = state.mediaSession;
  const pointerId = event.pointerId;
  event.preventDefault();
  isSeekingPointer = true;
  syncMediaSeekWatchdog();
  track.classList.add('seeking');
  const ownsPointer = (e) => pointerId == null || e?.pointerId == null || e.pointerId === pointerId;
  function onPointerMove(e) {
    if (!ownsPointer(e)) return;
    if (session !== state.mediaSession || video.hidden) { cleanup(); return; }
    const rect = track.getBoundingClientRect();
    if (rect.width <= 0) return;
    setPlayerCurrentTime(
      video,
      Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)) * duration,
      'pointer'
    );
    updateVideoProgress();
    if (showTooltip) onSeekPointerHover(e);
  }
  function cleanup() {
    isSeekingPointer = false;
    track.classList.remove('seeking');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', cleanup);
    if (activeSeekCleanup === cleanup) activeSeekCleanup = null;
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    resetControlsTimer();
  }
  function onPointerUp(e) { if (ownsPointer(e)) cleanup(); }
  activeSeekCleanup = cleanup;
  onPointerMove(event);
  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', cleanup);
}

function onSeekPointerHover(event) {
  if (!el.videoPlayer || !el.seekBarTooltip || el.videoPlayer.hidden) return;
  const ratio = getSeekRatio(event);
  const duration = playerTimeline().duration || 0;
  const hoverTime = ratio * duration;
  el.seekBarTooltip.textContent = formatPlayerTime(hoverTime);
  el.seekBarTooltip.style.left = `${ratio * 100}%`;
  el.seekBarTooltip.hidden = false;
}

function onSeekPointerLeave() {
  if (isSeekingPointer) return;
  if (el.seekBarTooltip) el.seekBarTooltip.hidden = true;
}

function onShortsProgressPointerDown(event) {
  beginPointerSeek(event, el.mobileShortsProgressTrack);
}

function onMediaStageClick(event) {
  playerChromeTouch = event.pointerType === 'touch' || event.sourceCapabilities?.firesTouchEvents === true;
  const target = event.target;
  if (isPlayerGestureControl(target)) {
    cancelPendingStageTap();
    return;
  }
  if (isMobileDevice() && event.sourceCapabilities?.firesTouchEvents !== false
    && isReservedBackStart(event.clientX)) { cancelPendingStageTap(); return; }
  handleStageTap(event.clientX, event.clientY);
}

function toggleFullscreen() {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  const previewActive = state.mediaAttempt.startsWith('drive-preview');
  if (isFs) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } else {
    const target = previewActive ? (el.playerModal || el.mediaStage) : (el.mediaStage || el.videoPlayer);
    if (target.requestFullscreen) {
      target.requestFullscreen().catch((err) => {
        reportAppFailure('fullscreen-request', err, 'warn');
        if (!previewActive && el.videoPlayer.webkitEnterFullscreen) el.videoPlayer.webkitEnterFullscreen();
      });
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    } else if (!previewActive && el.videoPlayer.webkitEnterFullscreen) {
      el.videoPlayer.webkitEnterFullscreen();
    }
  }
}

function updateFullscreenUI() {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (el.iconExpand && el.iconCompress) {
    el.iconExpand.toggleAttribute('hidden', isFs);
    el.iconCompress.toggleAttribute('hidden', !isFs);
  }
  if (el.ctrlIconExpand && el.ctrlIconCompress) {
    el.ctrlIconExpand.toggleAttribute('hidden', isFs);
    el.ctrlIconCompress.toggleAttribute('hidden', !isFs);
  }
  if (el.fullscreenButton) {
    el.fullscreenButton.title = isFs ? '전체화면 종료 (ESC / F)' : '전체화면 (F)';
    el.fullscreenButton.setAttribute('aria-label', isFs ? '전체화면 종료' : '전체화면');
  }
  if (el.ctrlFullscreen) {
    el.ctrlFullscreen.title = isFs ? '전체화면 종료 (ESC / F)' : '전체화면 (F)';
    el.ctrlFullscreen.setAttribute('aria-label', isFs ? '전체화면 종료' : '전체화면');
  }
}

async function togglePictureInPicture() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await el.videoPlayer.requestPictureInPicture();
    }
  } catch (err) {
    reportAppFailure('picture-in-picture', err, 'warn');
  }
}

/* Mobile shorts bottom action chips — ⋯ 버튼 위 세로 스택으로 삭제/이동/PiP/Drive 노출 */
function toggleShortsExpand() {
  if (!el.mobileShortsOverlay) return;
  const expanded = el.mobileShortsOverlay.classList.toggle('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', String(expanded));
  // Keep menus available until an explicit dismissal or action. A timer must
  // not make an action disappear while it is being read or keyboard-focused.
  resetControlsTimer();
}

function collapseShortsExpand() {
  if (el.mobileShortsOverlay) el.mobileShortsOverlay.classList.remove('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', 'false');
  if (el.playerSheet && !el.playerSheet.hidden) resetControlsTimer();
}

/* 영상 90도 회전 (시계 방향) — UI는 그대로 두고 영상만 회전.
   개별 transform 속성 rotate를 쓰면 드래그/스냅백 애니메이션(transform)과 자연스럽게 합성된다. */
function toggleVideoRotation() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  state.videoRotated = !state.videoRotated;
  el.videoPlayer.classList.toggle('is-rotated', state.videoRotated);
  if (el.shortsRotateBtn) el.shortsRotateBtn.setAttribute('aria-pressed', String(state.videoRotated));
}

function resetVideoRotation() {
  state.videoRotated = false;
  el.videoPlayer?.classList.remove('is-rotated');
  if (el.shortsRotateBtn) el.shortsRotateBtn.setAttribute('aria-pressed', 'false');
}

/* 비디오 첫 프레임을 캡처해 앰비언트 배경으로 채움 (레터박스 공간 제거) */
function tryCaptureAmbientFrame() {
  if (!el.ambientBackdrop || el.ambientBackdrop.classList.contains('active')) return;
  const video = el.videoPlayer;
  if (!video || video.hidden || !video.videoWidth || !video.videoHeight) return;
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    el.ambientBackdrop.style.backgroundImage = `url("${canvas.toDataURL('image/jpeg', 0.72)}")`;
    el.ambientBackdrop.classList.add('active');
  } catch (_) {}
}

function showPlayerFeedback(text, { persistent = false } = {}) {
  if (!el.playerFeedback) return;
  if (mobileHoldSpeed?.active && !persistent) return;
  el.playerFeedback.textContent = text;
  el.playerFeedback.hidden = false;
  requestAnimationFrame(() => el.playerFeedback.classList.add('active'));
  clearTimeout(feedbackTimer);
  if (persistent) { feedbackTimer = null; el.playerFeedback.classList.add('active'); return; }
  feedbackTimer = setTimeout(() => {
    el.playerFeedback.classList.remove('active');
    setTimeout(() => { if (!el.playerFeedback.classList.contains('active')) el.playerFeedback.hidden = true; }, 200);
  }, 800);
}

