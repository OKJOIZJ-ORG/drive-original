'use strict';

// Playback deck, swipe transitions, touch gestures and keyboard control.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function getPlaybackFileList() {
  const files = sortedPopulationFiles();
  const hidden = state.hiddenActionFileIds;
  return hidden.size ? files.filter((file) => !hidden.has(file.id)) : files;
}

function getPlaybackFileById(fileId, list = getPlaybackFileList()) {
  return (Array.isArray(list) ? list : []).find((file) => file?.id === fileId) || null;
}

function hasCompletePlaybackPopulation() {
  if (state.filter === 'favorites') return !state.loadingFavorites;
  return Boolean(state.demo || state.deepScan || state.populationComplete);
}

function extendPlaybackOrder(files = getPlaybackFileList()) {
  const known = new Set(state.playbackOrderIds);
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (!file?.id || known.has(file.id)) return;
    known.add(file.id);
    state.playbackOrderIds.push(file.id);
  });
}

function ensureVerticalPlaybackDeck(file = state.selected, list = getPlaybackFileList()) {
  if (!file?.id) return state.playbackDeck;
  const knownIds = new Set((Array.isArray(list) ? list : []).map((item) => item?.id).filter(Boolean));
  const deck = state.playbackDeck || { anchorId: null, above: [], below: [] };
  const invalid = deck.anchorId !== file.id
    || [...(deck.above || []), ...(deck.below || [])].some((id) => !knownIds.has(id))
    || (hasCompletePlaybackPopulation() && !state.playbackDeckComplete);
  if (invalid || !(deck.above?.length || deck.below?.length)) {
    state.playbackDeck = buildAccountPlaybackDeck(list, file.id);
    state.playbackDeckComplete = hasCompletePlaybackPopulation();
  }
  return state.playbackDeck;
}

function resolveSequentialPlaybackTarget(direction, list = getPlaybackFileList()) {
  const byId = new Map((Array.isArray(list) ? list : []).filter((file) => file?.id).map((file) => [file.id, file]));
  const order = state.playbackOrderIds.filter((id) => byId.has(id));
  if (!order.length) return null;
  const currentIndex = state.selected ? order.indexOf(state.selected.id) : -1;
  const offset = direction === 'right' ? -1 : 1;
  const index = currentIndex < 0 ? 0 : (currentIndex + offset + order.length) % order.length;
  return byId.get(order[index]) || null;
}

function resolveVerticalPlaybackTarget(direction, list = getPlaybackFileList()) {
  const deck = ensureVerticalPlaybackDeck(state.selected, list);
  const ids = direction === 'down' ? deck.above : deck.below;
  for (const id of ids || []) {
    const file = getPlaybackFileById(id, list);
    if (file) return file;
  }
  return pickRandomFile(list, state.selected?.id);
}

function resolveSwipeTarget(direction, list = getPlaybackFileList()) {
  if (direction === 'left' || direction === 'right') return resolveSequentialPlaybackTarget(direction, list);
  return resolveVerticalPlaybackTarget(direction, list);
}

function getFileThumbnail(file) {
  if (!file || isGifFile(file)) return '';
  return file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
}

function warmThumbnail(file) {
  const source = getFileThumbnail(file);
  if (!source || warmedThumbnails.has(file.id) || typeof Image !== 'function') return;
  const image = new Image();
  image.decoding = 'async';
  image.fetchPriority = 'low';
  image.referrerPolicy = 'no-referrer';
  image.src = source;
  warmedThumbnails.set(file.id, image);
  while (warmedThumbnails.size > THUMBNAIL_WARM_LIMIT) {
    warmedThumbnails.delete(warmedThumbnails.keys().next().value);
  }
}

function warmPlaybackNeighborhood(file = state.selected, { loadPopulation = false } = {}) {
  if (!file?.id || el.playerSheet?.hidden || isVideoStartupPending()) return;
  const list = getPlaybackFileList();
  const deck = ensureVerticalPlaybackDeck(file, list);
  const ids = [...(deck.above || []), ...(deck.below || [])];
  const previous = resolveSequentialPlaybackTarget('right', list);
  const next = resolveSequentialPlaybackTarget('left', list);
  [previous, next, ...ids.map((id) => getPlaybackFileById(id, list))].filter(Boolean).forEach(warmThumbnail);

  if (
    loadPopulation && !state.populationComplete && !state.demo && !state.deepScan
    && !playbackPopulationWarmPromise
  ) {
    const playerSession = state.playbackSession;
    playbackPopulationWarmPromise = ensureAllPagesLoaded()
      .then(() => {
        if (playerSession !== state.playbackSession || el.playerSheet.hidden || !state.selected) return;
        // Preserve the already visible left/right order and append later pages
        // to its tail instead of reshuffling a session beneath the user.
        const fullList = getPlaybackFileList();
        extendPlaybackOrder(fullList);
        // Vertical random playback is contractually sampled from the complete
        // folder population. Replace the provisional first-page neighbours as
        // soon as metadata collection finishes, before the first commit.
        state.playbackDeck = buildAccountPlaybackDeck(fullList, state.selected.id);
        state.playbackDeckComplete = true;
        warmPlaybackNeighborhood(state.selected);
      })
      .catch((error) => {
        if (error?.name !== 'AbortError') reportAppFailure('playback-pool-warmup', error, 'warn');
      })
      .finally(() => { playbackPopulationWarmPromise = null; });
  }
}

function isCurrentMediaEvent(element) {
  return Boolean(
    element && state.selected
    && Number(element.dataset?.mediaSession) === state.mediaSession
  );
}

function getActiveMediaElement() {
  if (el.videoPlayer && !el.videoPlayer.hidden) return el.videoPlayer;
  if (el.imageViewer && !el.imageViewer.hidden) return el.imageViewer;
  if (el.drivePreview && !el.drivePreview.hidden) return el.drivePreview;
  return null;
}

function cancelMediaTransitionAnimations() {
  mediaTransitionTimers.forEach(clearTimeout);
  mediaTransitionTimers = [];
  mediaTransitionAnimations.forEach((animation) => animation.cancel?.());
  mediaTransitionAnimations = [];
}

function getNeighborStartPosition(direction) {
  const width = swipeStageWidth || el.mediaStage?.clientWidth || window.innerWidth || 400;
  const height = swipeStageHeight || el.mediaStage?.clientHeight || window.innerHeight || 600;
  if (direction === 'left') return { x: width, y: 0 };
  if (direction === 'right') return { x: -width, y: 0 };
  if (direction === 'up') return { x: 0, y: height };
  return { x: 0, y: -height };
}

function renderSwipeNeighbor(direction, target, dragX = 0, dragY = 0) {
  if (!el.mediaSwipeNeighbor || !target) return null;
  const changed = swipePreviewTargetId !== target.id || swipePreviewDirection !== direction;
  if (changed) {
    swipeNeighborGeneration += 1;
    const thumbnail = getFileThumbnail(target);
    const imageValue = thumbnail ? `url("${String(thumbnail).replace(/"/g, '%22')}")` : '';
    el.mediaSwipeNeighborImage.style.backgroundImage = imageValue;
    el.mediaSwipeNeighborBackdrop.style.backgroundImage = imageValue;
    el.mediaSwipeNeighbor.classList.toggle('has-thumbnail', Boolean(thumbnail));
    el.mediaSwipeNeighborTitle.textContent = target.name || '다음 미디어';
    swipePreviewTargetId = target.id;
    swipePreviewDirection = direction;
    warmThumbnail(target);
  }
  const start = getNeighborStartPosition(direction);
  el.mediaSwipeNeighbor.hidden = false;
  el.mediaSwipeNeighbor.style.transform = `translate3d(${start.x + dragX}px, ${start.y + dragY}px, 0)`;
  el.mediaSwipeNeighbor.style.opacity = '1';
  return el.mediaSwipeNeighbor;
}

function hideSwipeNeighbor({ immediate = true } = {}) {
  const neighbor = el.mediaSwipeNeighbor;
  const generation = ++swipeNeighborGeneration;
  swipePreviewDirection = null;
  swipePreviewTargetId = null;
  if (!neighbor) return;
  const finish = () => {
    if (generation !== swipeNeighborGeneration) return;
    neighbor.hidden = true;
    neighbor.style.transform = '';
    neighbor.style.opacity = '';
    el.mediaSwipeNeighborImage.style.backgroundImage = '';
    el.mediaSwipeNeighborBackdrop.style.backgroundImage = '';
    el.mediaSwipeNeighborTitle.textContent = '';
    neighbor.classList.remove('has-thumbnail');
  };
  if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches || typeof neighbor.animate !== 'function') {
    finish();
    return;
  }
  const animation = neighbor.animate(
    [{ opacity: Number(neighbor.style.opacity || 1) }, { opacity: 0 }],
    { duration: 140, easing: 'ease-out' }
  );
  mediaTransitionAnimations.push(animation);
  animation.finished.catch(() => {}).finally(finish);
}

function clearMediaTransition({ keepNeighbor = false } = {}) {
  cancelMediaTransitionAnimations();
  [el.videoPlayer, el.imageViewer, el.drivePreview].forEach((node) => {
    if (!node) return;
    node.className = node.className.replace(/\banim-slide-[a-z-]+\b/g, '').trim();
    node.style.transform = '';
    node.style.opacity = '';
  });
  el.mediaStage?.classList.remove('is-dragging', 'is-snapping');
  if (snapBackTimer) clearTimeout(snapBackTimer);
  snapBackTimer = null;
  if (!keepNeighbor) hideSwipeNeighbor();
}

function getTransitionTransform(direction, distance) {
  const dx = direction === 'left' ? -distance : direction === 'right' ? distance : 0;
  const dy = direction === 'up' ? -distance : direction === 'down' ? distance : 0;
  if (!state.videoRotated) return `translate3d(${dx}px, ${dy}px, 0)`;
  return `translate3d(${dy}px, ${-dx}px, 0)`;
}

async function animateMediaTransition(direction, callback, target = null) {
  stopMobileHoldSpeed();
  const currentEl = getActiveMediaElement();
  const stage = el.mediaStage;
  const session = state.playbackSession;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const startTransform = currentEl?.style.transform || 'translate3d(0, 0, 0)';
  const startOpacity = Number(currentEl?.style.opacity || 1);
  cancelMediaTransitionAnimations();
  mediaTransitionCommitting = true;

  swipeStageWidth = stage?.clientWidth || window.innerWidth || 400;
  swipeStageHeight = stage?.clientHeight || window.innerHeight || 600;
  const neighbor = target
    ? (swipePreviewTargetId === target.id && swipePreviewDirection === direction && !el.mediaSwipeNeighbor?.hidden
        ? el.mediaSwipeNeighbor
        : renderSwipeNeighbor(direction, target))
    : (!el.mediaSwipeNeighbor?.hidden ? el.mediaSwipeNeighbor : null);

  if (!stage || reducedMotion || typeof currentEl?.animate !== 'function') {
    try {
      if (neighbor) neighbor.style.transform = 'translate3d(0, 0, 0)';
      if (session === state.playbackSession && !el.playerSheet.hidden) callback();
    } finally {
      mediaTransitionCommitting = false;
    }
    return;
  }

  const distance = direction === 'left' || direction === 'right' ? swipeStageWidth : swipeStageHeight;
  const outAnimation = currentEl.animate([
    { transform: startTransform, opacity: startOpacity },
    { transform: getTransitionTransform(direction, distance), opacity: 1 }
  ], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
  const animations = [outAnimation];
  if (neighbor && typeof neighbor.animate === 'function') {
    const neighborStart = neighbor.style.transform || (() => {
      const start = getNeighborStartPosition(direction);
      return `translate3d(${start.x}px, ${start.y}px, 0)`;
    })();
    animations.push(neighbor.animate([
      { transform: neighborStart, opacity: 1 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 }
    ], { duration: 220, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' }));
  }
  mediaTransitionAnimations.push(...animations);
  try {
    await Promise.all(animations.map((animation) => animation.finished));
  } catch (_) {
    mediaTransitionCommitting = false;
    return;
  }
  if (session !== state.playbackSession || el.playerSheet.hidden) {
    mediaTransitionCommitting = false;
    return;
  }
  animations.forEach((animation) => animation.cancel?.());
  currentEl.style.transform = '';
  currentEl.style.opacity = '';
  if (neighbor) {
    neighbor.style.transform = 'translate3d(0, 0, 0)';
    neighbor.style.opacity = '1';
  }
  try {
    callback();
  } finally {
    mediaTransitionCommitting = false;
  }
  mediaTransitionAnimations = [];
}

function restoreDraggedMediaPosition() {
  el.mediaStage?.classList.remove('is-dragging');
  const active = getActiveMediaElement();
  if (!active) return;
  if (active.style.transform || active.style.opacity) snapBackSpring(active);
}

async function prepareFullPlaybackPopulation() {
  const generation = state.listGeneration;
  if (!state.populationComplete && !state.demo && !state.deepScan) {
    showPlayerFeedback('전체 미디어를 확인하는 중');
  }
  await ensureAllPagesLoaded();
  if (generation !== state.listGeneration) throw new DOMException('Collection aborted', 'AbortError');
  const fullList = getPlaybackFileList();
  extendPlaybackOrder(fullList);
  if (state.selected) {
    state.playbackDeck = buildAccountPlaybackDeck(fullList, state.selected.id);
    state.playbackDeckComplete = true;
  }
}

function enqueuePlaybackNavigation(
  resolveTarget,
  direction,
  errorPrefix = '전체 파일을 불러오지 못했습니다',
  requireFullPopulation = false,
  onCommit = null
) {
  const playerSession = state.playbackSession;
  const task = async () => {
    try {
      if (requireFullPopulation) {
        restoreDraggedMediaPosition();
        await prepareFullPlaybackPopulation();
      }
    } catch (error) {
      restoreDraggedMediaPosition();
      if (error?.name !== 'AbortError') showToast(`${errorPrefix}: ${humanizeDriveError(error)}`);
      return;
    }
    if (playerSession !== state.playbackSession || el.playerSheet.hidden) return;
    const target = resolveTarget(getPlaybackFileList());
    if (!target) {
      restoreDraggedMediaPosition();
      return;
    }
    state.pendingPlay = true;
    await animateMediaTransition(direction, () => {
      if (playerSession !== state.playbackSession || el.playerSheet.hidden) return;
      onCommit?.(target, getPlaybackFileList());
      openMediaSource(target);
      warmPlaybackNeighborhood(target);
    }, target);
  };
  playbackNavigationChain = playbackNavigationChain.then(task, task);
  return playbackNavigationChain;
}

// Deck commits run only once navigation to the target is confirmed.
function rebuildPlaybackDeck(target, list) {
  state.playbackDeck = buildAccountPlaybackDeck(list, target.id);
  state.playbackDeckComplete = hasCompletePlaybackPopulation();
}

function advancePlaybackDeck(direction, target, list) {
  state.playbackDeck = advanceAccountPlaybackDeck(state.playbackDeck, direction, target.id, list);
  if (!state.playbackOrderIds.includes(target.id)) state.playbackOrderIds.push(target.id);
}

function playNextFile(direction = 'left') {
  return enqueuePlaybackNavigation(
    (list) => resolveSequentialPlaybackTarget('left', list), direction, undefined, false, rebuildPlaybackDeck
  );
}

function playPrevFile(direction = 'right') {
  return enqueuePlaybackNavigation(
    (list) => resolveSequentialPlaybackTarget('right', list), direction, undefined, false, rebuildPlaybackDeck
  );
}

function playRandomFile(direction = 'up') {
  const dir = typeof direction === 'string' ? direction : 'up';
  const needsCompletePopulation = !state.populationComplete && !state.demo && !state.deepScan;
  return enqueuePlaybackNavigation(
    (list) => resolveVerticalPlaybackTarget(dir, list),
    dir,
    '랜덤 재생 준비 실패',
    needsCompletePopulation,
    (target, list) => advancePlaybackDeck(dir, target, list)
  );
}

function playFrozenSwipeTarget(targetId, direction) {
  const vertical = direction === 'up' || direction === 'down';
  return enqueuePlaybackNavigation(
    (list) => getPlaybackFileById(targetId, list),
    direction,
    vertical ? '랜덤 재생 준비 실패' : undefined,
    false,
    vertical ? (target, list) => advancePlaybackDeck(direction, target, list) : rebuildPlaybackDeck
  );
}

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouchActive = false;
let touchContactId = null;
let touchSession = null;
let lockedAxis = null;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let lastTapZone = null;
let singleTapTimer = null;
let reservedEdgeTap = null;
let mobileHoldSpeed = null;
const MOBILE_HOLD_SPEED_DELAY = 450;
const MOBILE_HOLD_SPEED_FEEDBACK = '2×';

function resetSwipeGesture() {
  lockedAxis = null;
  swipeGestureDirection = null;
  swipeGestureTargetId = null;
  swipeGestureAwaitingPopulation = false;
}

function isCurrentMobileHoldSpeed(owner) {
  return Boolean(owner && owner.video === el.videoPlayer && !owner.video.hidden
    && !el.playerSheet?.hidden && state.selected?.id === owner.fileId
    && state.mediaSession === owner.session && state.playbackSession === owner.playbackSession
    && mediaSourceGeneration === owner.sourceGeneration && isCurrentMediaEvent(owner.video));
}

function canStartMobileHoldSpeed() {
  const video = el.videoPlayer;
  return Boolean(isMobileDevice() && video && !video.hidden && !video.paused && !video.ended
    && video.readyState >= 2 && isCurrentMediaEvent(video) && !el.playerSheet?.hidden
    && document.visibilityState !== 'hidden'
    && el.mediaLoading?.hidden !== false && el.mediaError?.hidden !== false
    && !state.pendingPlay && !state.isSeeking && !mediaTransitionCommitting && !swipeCommitPending
    && !state.mediaAttempt.startsWith('drive-preview') && state.mediaAttempt !== 'failed');
}

function startMobileHoldSpeed(contact) {
  stopMobileHoldSpeed();
  if (!canStartMobileHoldSpeed()) return;
  const rect = el.mediaStage.getBoundingClientRect();
  const nx = (contact.clientX - rect.left) / rect.width;
  const ny = (contact.clientY - rect.top) / rect.height;
  // Hold shares the narrow lateral bands with seek, including their corners;
  // quick corner taps still use the ordinary controls-reveal recognizer.
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1
    || (nx > 0.18 && nx < 0.82)) return;
  const owner = { video: el.videoPlayer, fileId: state.selected.id, session: state.mediaSession,
    playbackSession: state.playbackSession, sourceGeneration: mediaSourceGeneration, active: false, timer: null };
  mobileHoldSpeed = owner;
  owner.timer = setTimeout(() => {
    owner.timer = null;
    if (mobileHoldSpeed !== owner || !isCurrentMobileHoldSpeed(owner) || !canStartMobileHoldSpeed()) {
      stopMobileHoldSpeed(); return;
    }
    owner.previousRate = owner.video.playbackRate;
    owner.active = true;
    cancelPendingStageTap();
    owner.video.playbackRate = 2;
    updateSpeedUI();
    showPlayerFeedback(MOBILE_HOLD_SPEED_FEEDBACK, { persistent: true });
  }, MOBILE_HOLD_SPEED_DELAY);
}

function stopMobileHoldSpeed() {
  const owner = mobileHoldSpeed;
  if (!owner) return false;
  mobileHoldSpeed = null;
  clearTimeout(owner.timer);
  // Retire before a source/session is replaced. A stale release never assigns
  // its old rate to a newly opened video using the same HTMLVideoElement.
  if (owner.active && isCurrentMobileHoldSpeed(owner)) {
    owner.video.playbackRate = owner.previousRate;
    updateSpeedUI();
  }
  if (owner.active && el.playerFeedback?.textContent === MOBILE_HOLD_SPEED_FEEDBACK) {
    el.playerFeedback.classList.remove('active');
    el.playerFeedback.hidden = true;
  }
  // Once activated, this contact is consumed even if pause/end or another
  // command ends the temporary rate before the finger is released.
  if (owner.active) clearActiveTouchGesture();
  return owner.active;
}

function isPlayerGestureControl(target) {
  return Boolean(target?.closest?.('.player-chrome, .custom-video-controls, .mobile-shorts-overlay, .seek-bar-container, .mobile-shorts-progress-track, .shorts-expand-row, .speed-dropdown, .volume-slider-wrap, .stage-center-btn, .media-error, .media-loading, button, a, input, select, textarea, summary, [role="button"], [role="slider"]'));
}

function cancelPendingStageTap() {
  clearTimeout(singleTapTimer);
  singleTapTimer = null;
  lastTapTime = 0;
  lastTapX = 0;
  lastTapY = 0;
  lastTapZone = null;
}

function trackSwipeCommit(navigationPromise) {
  swipeCommitPending = true;
  Promise.resolve(navigationPromise)
    .catch((error) => reportAppFailure('swipe-navigation', error, 'warn'))
    .finally(() => {
      swipeCommitPending = false;
      if (!el.playerSheet?.hidden) restoreDraggedMediaPosition();
    });
}

function getTapZone(clientX, clientY) {
  const rect = el.mediaStage.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (!Number.isFinite(nx) || !Number.isFinite(ny) || nx < 0 || nx > 1 || ny < 0 || ny > 1) return null;
  // A square keeps the pause target the same shape in portrait and landscape.
  const halfSide = Math.min(rect.width, rect.height) * 0.28;
  const dx = clientX - rect.left - rect.width / 2;
  const dy = clientY - rect.top - rect.height / 2;
  if (Math.abs(dx) <= halfSide && Math.abs(dy) <= halfSide) return 'center';
  if (Math.abs(dy) <= halfSide) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'top' : 'bottom';
}

function setStageImmersive(on) {
  if (on) setPlayerChromeVisible(false);
  else resetControlsTimer();
}

function handleStageTap(clientX, clientY) {
  const session = state.mediaSession;
  const now = Date.now();
  const zone = getTapZone(clientX, clientY);
  if (!zone) { cancelPendingStageTap(); return; }
  const isDoubleTap = lastTapTime > 0 && zone === lastTapZone && (now - lastTapTime < 320)
    && Math.hypot(clientX - lastTapX, clientY - lastTapY) <= 48;
  lastTapTime = now;
  lastTapX = clientX;
  lastTapY = clientY;
  lastTapZone = zone;

  if (isDoubleTap) {
    // Consume the pair. A third rapid tap starts a new gesture instead of
    // chaining against the second tap and toggling the favorite repeatedly.
    cancelPendingStageTap();
    const rect = el.mediaStage.getBoundingClientRect();
    const doubleTapAction = resolveMediaDoubleTapAction(clientX, rect.left, rect.width, !el.videoPlayer?.hidden, zone);
    // Center likes, lateral edges seek. Top/bottom contacts do neither.
    if (doubleTapAction === 'seek-backward' || doubleTapAction === 'seek-forward') {
      seekRelative(doubleTapAction === 'seek-backward' ? -10 : 10);
    } else if (doubleTapAction === 'favorite') {
      toggleFavoriteForSelected({ showFeedback: true });
      navigator.vibrate?.(10);
    }
    return;
  }

  // Every outer contact reveals controls, including corners. Keep pair history
  // for narrow lateral seek, while only the center can schedule pause/play.
  if (singleTapTimer) clearTimeout(singleTapTimer);
  singleTapTimer = null;
  if (zone !== 'center') {
    if (!el.playerModal.classList.contains('controls-idle')) {
      setPlayerChromeVisible(false);
    } else revealPlayerChrome({ touch: playerChromeTouch });
    return;
  }
  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    if (session !== state.mediaSession || el.playerSheet?.hidden) return;
    if (el.videoPlayer && !el.videoPlayer.hidden) togglePlayPause();
  }, 320);
}

function setupTouchGestures() {
  const modal = el.playerModal || el.mediaStage;
  if (!modal) return;

  modal.addEventListener('touchstart', (e) => {
    // Controls retain their native click/seek handling and cannot inherit a
    // preceding stage contact or its deferred pause action.
    if (isPlayerGestureControl(e.target)) { cancelActiveTouchGesture(); return; }
    // Reservation happens before either recognizer locks intent. Even a
    // cancelled OS/back gesture cannot be reinterpreted as previous video.
    if (e.touches.length === 1 && isReservedBackStart(e.touches[0].clientX)) {
      cancelActiveTouchGesture();
      const contact = e.touches[0];
      if (e.cancelable !== false) reservedEdgeTap = { x: contact.clientX, y: contact.clientY,
        id: contact.identifier ?? null, time: Date.now(), session: state.mediaSession };
      if (reservedEdgeTap && el.mediaStage?.contains(e.target)) startMobileHoldSpeed(contact);
      return;
    }
    if (state.mediaAttempt.startsWith('drive-preview')) { cancelActiveTouchGesture(); return; }
    if (mediaTransitionCommitting || swipeCommitPending) {
      cancelActiveTouchGesture();
      if (e.cancelable) e.preventDefault();
      return;
    }
    if (e.touches.length !== 1) {
      cancelActiveTouchGesture();
      return;
    }
    if (e.cancelable === false) { cancelActiveTouchGesture(); return; }
    if (el.mediaStage?.contains && !el.mediaStage.contains(e.target)) { cancelActiveTouchGesture(); return; }

    // Reserve this media contact before the intent threshold. If its first
    // move is smaller than 12px, Chrome can otherwise make later moves
    // uncancelable before our axis recognizer gets a chance to own the drag.
    e.preventDefault();
    playerChromeTouch = true;
    // A second contact may still become a double tap, but cannot let the first
    // tap timer fire while this contact is being held or dragged.
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
    clearMediaTransition();
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    touchContactId = e.touches[0].identifier ?? null;
    touchSession = state.mediaSession;
    swipeStageWidth = el.mediaStage?.clientWidth || window.innerWidth || 400;
    swipeStageHeight = el.mediaStage?.clientHeight || window.innerHeight || 600;
    isTouchActive = true;
    resetSwipeGesture();
    startMobileHoldSpeed(e.touches[0]);
  }, { passive: false });

  modal.addEventListener('touchmove', (e) => {
    if (reservedEdgeTap) {
      const contact = e.touches[0];
      if (e.touches.length !== 1 || e.cancelable === false || reservedEdgeTap.session !== state.mediaSession
        || (reservedEdgeTap.id !== null && contact.identifier !== reservedEdgeTap.id)
        || Math.hypot(contact.clientX - reservedEdgeTap.x, contact.clientY - reservedEdgeTap.y) >= 10) {
        stopMobileHoldSpeed(); reservedEdgeTap = null;
      }
      return;
    }
    if (!isTouchActive) return;
    if (touchSession !== state.mediaSession) { cancelActiveTouchGesture(); return; }
    if (e.cancelable === false) { cancelActiveTouchGesture(); return; }
    if (e.touches.length !== 1 || (touchContactId !== null && e.touches[0].identifier !== touchContactId)) {
      cancelActiveTouchGesture();
      return;
    }
    const rawX = e.touches[0].clientX - touchStartX;
    const rawY = e.touches[0].clientY - touchStartY;
    if (Math.hypot(rawX, rawY) >= 10 && stopMobileHoldSpeed()) {
      cancelActiveTouchGesture(); return;
    }
    if (Math.hypot(rawX, rawY) >= 10) cancelPendingStageTap();
    
    // Lock only after a deliberate, clearly dominant direction emerges.
    if (lockedAxis === null) {
      const absX = Math.abs(rawX);
      const absY = Math.abs(rawY);
      if (Math.hypot(absX, absY) >= 12) {
        if (absX >= Math.max(1, absY) * 1.25) {
          cancelPendingStageTap();
          lockedAxis = 'x';
          swipeGestureDirection = rawX < 0 ? 'left' : 'right';
          swipeGestureTargetId = resolveSwipeTarget(swipeGestureDirection)?.id || null;
        } else if (absY >= Math.max(1, absX) * 1.25) {
          cancelPendingStageTap();
          lockedAxis = 'y';
          swipeGestureDirection = rawY < 0 ? 'up' : 'down';
          swipeGestureAwaitingPopulation = !hasCompletePlaybackPopulation();
          if (!swipeGestureAwaitingPopulation) {
            swipeGestureTargetId = resolveSwipeTarget(swipeGestureDirection)?.id || null;
          }
        }
      }
    }

    const activeEl = getActiveMediaElement();

    if (lockedAxis === 'x') {
      e.preventDefault();
      // Direct manipulation: the current and adjacent item stay attached to
      // the finger on one strict horizontal rail.
      const direction = swipeGestureDirection;
      const directionalX = direction === 'left' ? Math.min(0, rawX) : Math.max(0, rawX);
      const dragX = Math.max(-swipeStageWidth, Math.min(swipeStageWidth, directionalX));
      const target = getPlaybackFileById(swipeGestureTargetId);
      el.mediaStage?.classList.add('is-dragging');
      if (target) renderSwipeNeighbor(direction, target, dragX, 0);
      if (activeEl) {
        // 90도 회전 상태에선 요소 좌표계가 화면과 어긋난다(요소 X→화면 아래, 요소 Y→화면 왼쪽).
        // 화면 방향 그대로 따라오게 드래그 변위를 요소 공간으로 치환해 적용한다.
        const tx = state.videoRotated ? 0 : dragX;
        const ty = state.videoRotated ? -dragX : 0;
        activeEl.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        activeEl.style.opacity = '1';
      }
    } else if (lockedAxis === 'y') {
      e.preventDefault();
      // The preassigned random deck uses the same 1:1 vertical rail.
      const direction = swipeGestureDirection;
      if (swipeGestureAwaitingPopulation && hasCompletePlaybackPopulation()) {
        swipeGestureAwaitingPopulation = false;
        swipeGestureTargetId = resolveSwipeTarget(direction)?.id || null;
      }
      const directionalY = direction === 'up' ? Math.min(0, rawY) : Math.max(0, rawY);
      const dragY = Math.max(-swipeStageHeight, Math.min(swipeStageHeight, directionalY));
      const target = getPlaybackFileById(swipeGestureTargetId);
      el.mediaStage?.classList.add('is-dragging');
      if (target) renderSwipeNeighbor(direction, target, 0, dragY);
      if (activeEl) {
        const tx = state.videoRotated ? dragY : 0;
        const ty = state.videoRotated ? 0 : dragY;
        activeEl.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        activeEl.style.opacity = '1';
      }
    }
  }, { passive: false });

  modal.addEventListener('touchend', (e) => {
    if (stopMobileHoldSpeed()) {
      if (e.cancelable) e.preventDefault();
      cancelActiveTouchGesture(); return;
    }
    if (reservedEdgeTap) {
      const candidate = reservedEdgeTap;
      reservedEdgeTap = null;
      const contact = e.changedTouches[0];
      const zone = contact && getTapZone(contact.clientX, contact.clientY);
      // Observe a stationary edge tap without claiming the OS back gesture.
      if (e.cancelable !== false && candidate.session === state.mediaSession && !el.playerSheet?.hidden
        && e.changedTouches.length === 1 && (candidate.id === null || contact.identifier === candidate.id)
        && Date.now() - candidate.time < 300
        && Math.hypot(contact.clientX - candidate.x, contact.clientY - candidate.y) < 10
        && zone && zone !== 'center') revealPlayerChrome({ touch: true });
      return;
    }
    if (!isTouchActive) return;
    if (e.cancelable === false || touchSession !== state.mediaSession || e.changedTouches.length !== 1
      || (touchContactId !== null && e.changedTouches[0].identifier !== touchContactId)) {
      cancelActiveTouchGesture(); return;
    }
    e.preventDefault();
    isTouchActive = false;
    touchContactId = null;
    touchSession = null;
    el.mediaStage?.classList.remove('is-dragging');

    const activeEl = getActiveMediaElement();
    const rawDiffX = e.changedTouches[0].clientX - touchStartX;
    const rawDiffY = e.changedTouches[0].clientY - touchStartY;
    const elapsed = Math.max(1, Date.now() - touchStartTime);

    // Tap (no axis locked, short duration, minimal movement) — shorts-style
    // double-tap seek on edges, central single tap toggles playback. preventDefault
    // stops the synthetic click so onMediaStageClick never double-fires.
    if (lockedAxis === null && elapsed < 300 && Math.abs(rawDiffX) < 10 && Math.abs(rawDiffY) < 10) {
      e.preventDefault();
      handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      resetSwipeGesture();
      return;
    }

    if (lockedAxis === 'x') {
      const axisSize = el.mediaStage?.clientWidth || window.innerWidth || 400;
      const directionalDelta = swipeGestureDirection === 'left' ? -rawDiffX : rawDiffX;
      if (shouldCommitLockedSwipe(directionalDelta, elapsed, axisSize) && swipeGestureTargetId) {
        trackSwipeCommit(playFrozenSwipeTarget(swipeGestureTargetId, swipeGestureDirection));
      } else {
        snapBackSpring(activeEl);
      }
    } else if (lockedAxis === 'y') {
      const axisSize = el.mediaStage?.clientHeight || window.innerHeight || 600;
      const directionalDelta = swipeGestureDirection === 'up' ? -rawDiffY : rawDiffY;
      if (shouldCommitLockedSwipe(directionalDelta, elapsed, axisSize)) {
        const navigation = swipeGestureTargetId
          ? playFrozenSwipeTarget(swipeGestureTargetId, swipeGestureDirection)
          : playRandomFile(swipeGestureDirection);
        trackSwipeCommit(navigation);
      } else {
        snapBackSpring(activeEl);
      }
    } else {
      snapBackSpring(activeEl);
    }
    cancelPendingStageTap();
    resetSwipeGesture();
  }, { passive: false });

  modal.addEventListener('touchcancel', cancelActiveTouchGesture, { passive: true });
  modal.addEventListener('pointercancel', () => {
    if (mobileHoldSpeed) cancelActiveTouchGesture();
  }, { passive: true });
  modal.addEventListener('lostpointercapture', () => {
    if (mobileHoldSpeed?.active) cancelActiveTouchGesture();
  }, { passive: true });
  modal.addEventListener('contextmenu', (event) => {
    if (mobileHoldSpeed && !isPlayerGestureControl(event.target)) event.preventDefault();
  });
}

function cancelActiveTouchGesture() {
  stopMobileHoldSpeed();
  clearActiveTouchGesture();
}

function clearActiveTouchGesture() {
  reservedEdgeTap = null;
  cancelPendingStageTap();
  if (!isTouchActive) return;
  isTouchActive = false;
  touchContactId = null;
  touchSession = null;
  resetSwipeGesture();
  el.mediaStage?.classList.remove('is-dragging');
  snapBackSpring(getActiveMediaElement());
}

function snapBackSpring(activeEl) {
  const neighbor = !el.mediaSwipeNeighbor?.hidden ? el.mediaSwipeNeighbor : null;
  if (!activeEl && !neighbor) return;
  if (snapBackTimer) clearTimeout(snapBackTimer);
  el.mediaStage?.classList.add('is-snapping');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (activeEl && !reducedMotion && typeof activeEl.animate === 'function') {
    const startTransform = activeEl.style.transform || 'translate3d(0, 0, 0)';
    const startOpacity = Number(activeEl.style.opacity || 1);
    const animation = activeEl.animate([
      { transform: startTransform, opacity: startOpacity },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 }
    ], { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });
    mediaTransitionAnimations.push(animation);
  }
  if (neighbor && swipePreviewDirection && !reducedMotion && typeof neighbor.animate === 'function') {
    const start = getNeighborStartPosition(swipePreviewDirection);
    const animation = neighbor.animate([
      { transform: neighbor.style.transform || 'translate3d(0, 0, 0)', opacity: 1 },
      { transform: `translate3d(${start.x}px, ${start.y}px, 0)`, opacity: 1 }
    ], { duration: 220, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', fill: 'forwards' });
    mediaTransitionAnimations.push(animation);
  }
  snapBackTimer = setTimeout(() => {
    if (activeEl) {
      activeEl.style.transform = '';
      activeEl.style.opacity = '1';
    }
    el.mediaStage?.classList.remove('is-snapping');
    hideSwipeNeighbor();
    snapBackTimer = null;
  }, reducedMotion ? 0 : 220);
}

function handlePlayerKeyboard(event) {
  if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (el.playerSheet.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT' || event.target.isContentEditable) return;
  if ((event.key === ' ' || event.key === 'Enter')
    && (targetTag === 'BUTTON' || targetTag === 'A' || targetTag === 'SUMMARY'
      || event.target.closest?.('button, a, summary, [role="button"]'))) return;

  const key = event.key.toLowerCase();
  const code = event.code;

  if (event.key === 'Escape') {
    if (el.mobileShortsOverlay?.classList.contains('expanded')) {
      event.preventDefault();
      collapseShortsExpand();
      el.shortsMoreBtn?.focus();
      return;
    }
    if (isPlayerMoreOpen) {
      event.preventDefault();
      closePlayerMoreMenu();
      resetControlsTimer();
      return;
    }
    if (isSpeedMenuOpen) {
      closeSpeedMenu();
      return;
    }
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      requestClosePlayer();
    }
    return;
  }

  if (key === 'f') {
    event.preventDefault();
    toggleFullscreen();
    return;
  }

  if (isVideo) {
    if (event.key === ' ' || key === 'k') {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (key === 'm') {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (event.key === 'ArrowLeft' || key === 'j') {
      event.preventDefault();
      seekRelative(-10);
      return;
    }

    if (event.key === 'ArrowRight' || key === 'l') {
      event.preventDefault();
      seekRelative(10);
      return;
    }

    if (event.key === ',') {
      event.preventDefault();
      stepVideoFrame(-1);
      return;
    }

    if (event.key === '.') {
      event.preventDefault();
      stepVideoFrame(1);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      el.videoPlayer.muted = false;
      el.videoPlayer.volume = Math.min(1, +(el.videoPlayer.volume + 0.1).toFixed(2));
      showPlayerFeedback(`음량 ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      el.videoPlayer.volume = Math.max(0, +(el.videoPlayer.volume - 0.1).toFixed(2));
      showPlayerFeedback(`음량 ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (code && code.startsWith('Digit') && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const digit = Number(code.replace('Digit', ''));
      if (!isNaN(digit) && playerTimeline().duration) {
        event.preventDefault();
        setPlayerCurrentTime(
          el.videoPlayer,
          (digit / 10) * playerTimeline().duration,
          'digit-shortcut'
        );
        showPlayerFeedback(`${digit * 10}%`);
        updateVideoProgress();
      }
    }
  }
}

function setNativeVideoActionsAvailable(available) {
  const enabled = Boolean(available);
  [el.mobileTimeDisplay, el.mobileShortsProgressTrack, el.seekHintLeft, el.seekHintRight].forEach((node) => {
    if (node) node.hidden = !enabled;
  });
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.shortsPipBtn) el.shortsPipBtn.hidden = !document.pictureInPictureEnabled || !enabled;
  updateFrameStepVisibility(enabled && Boolean(el.videoPlayer?.paused));
  if (el.shortsRotateBtn) el.shortsRotateBtn.hidden = !enabled;
  if (el.ctrlTracks) el.ctrlTracks.hidden = !enabled;
  if (el.shortsTracksBtn) el.shortsTracksBtn.hidden = !enabled;
  if (!enabled) {
    // Photos and cleared sources retire the whole video UI, including overlays
    // that may still be open when the next item replaces a playing video.
    if (el.customVideoControls) el.customVideoControls.hidden = true;
    if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.hidden = true;
    closeSpeedMenu();
    clearTimeout(feedbackTimer);
    feedbackTimer = null;
    if (el.playerFeedback) {
      el.playerFeedback.classList.remove('active');
      el.playerFeedback.hidden = true;
    }
  }
}

