'use strict';

// Library back history, edge-back gesture, deep scan, favorites view and breadcrumbs.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const libraryNavigation = {
  epoch: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  entries: new Map(), order: [], cursor: -1, sequence: 0, generation: 0,
  restoring: false, pending: false, edge: null, animations: [], timer: null, edgeTransition: null, suppressClickUntil: 0
};

function libraryNavigationOwner() { return state.demo ? 'demo' : state.accountId; }

function libraryViewConfig() {
  return {
    currentFolderId: state.currentFolderId, currentFolderName: state.currentFolderName,
    folderStack: state.folderStack.map((item) => ({ ...item })), filter: state.filter,
    query: state.query, sort: state.sort, deepScan: state.deepScan,
    scrollY: Math.max(0, window.scrollY || 0), renderWindowStart: state.renderWindowStart,
    renderRowHeight: state.renderRowHeight, folderRenderLimit: state.folderRenderLimit
  };
}

function captureLibraryVisual() {
  if (!el.libraryView || typeof document.createElement !== 'function' || !isMobileDevice()) return null;
  const snapshot = document.createElement('div');
  snapshot.className = 'library-edge-snapshot';
  snapshot.inert = true;
  snapshot.setAttribute('aria-hidden', 'true');
  const height = window.innerHeight;
  const selectors = '.library-header, .folder-nav, .toolbar, .selection-toolbar, .library-status, .account-sync-status, .folder-row, .folder-more, .file-card, .empty-state';
  el.libraryView.querySelectorAll(selectors).forEach((source) => {
    const rect = source.getBoundingClientRect();
    if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= height || source.closest('[hidden]')) return;
    const copy = source.cloneNode(true);
    copy.removeAttribute('id');
    copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    copy.querySelectorAll('button,input,select,a,[tabindex]').forEach((node) => { node.tabIndex = -1; });
    copy.style.cssText = `position:absolute;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;animation:none;transition:none;transform:none;`;
    if (source.matches('.file-card')) copy.classList.remove('defer-render');
    const images = source.querySelectorAll('img');
    copy.querySelectorAll('img').forEach((image, index) => {
      if (!images[index]?.complete || !images[index]?.naturalWidth) image.removeAttribute('src');
      image.loading = 'eager';
    });
    const canvases = source.querySelectorAll('canvas');
    copy.querySelectorAll('canvas').forEach((canvas, index) => {
      const original = canvases[index];
      canvas.width = original.width; canvas.height = original.height;
      try { canvas.getContext('2d')?.drawImage(original, 0, 0); } catch (_) {}
    });
    snapshot.appendChild(copy);
  });
  return { node: snapshot, width: window.innerWidth, height };
}

function rememberLibraryView() {
  const entry = libraryNavigation.entries.get(libraryNavigation.order[libraryNavigation.cursor]);
  if (!entry) return;
  entry.view = libraryViewConfig();
  entry.data = {
    files: state.files, folders: state.folders, favoriteFiles: state.favoriteFiles,
    nextPageToken: state.nextPageToken, populationComplete: state.populationComplete,
    listLoadError: state.listLoadError, listPageTokens: new Set(state.listPageTokens),
    order: new Map(shuffledOrderMap), revision: libraryNavigation.dataRevision || 0,
    complete: !state.loadingFiles && !state.loadingFavorites && !state.loadingTree
  };
  entry.visual = captureLibraryVisual();
  try {
    history.replaceState({ ...history.state, driveOriginalNavigation: {
      epoch: libraryNavigation.epoch, id: entry.id, owner: libraryNavigationOwner(), view: entry.view
    } }, '', location.href);
  } catch (_) {}
}

function beginLibraryNavigation() {
  if (libraryNavigation.restoring || typeof history === 'undefined' || typeof history.pushState !== 'function' || !libraryNavigationOwner()) return;
  cancelLibraryEdgeBack();
  if (libraryNavigation.cursor < 0) {
    const entry = { id: ++libraryNavigation.sequence };
    libraryNavigation.entries.set(entry.id, entry);
    libraryNavigation.order = [entry.id]; libraryNavigation.cursor = 0;
  }
  rememberLibraryView();
}

function commitLibraryNavigation() {
  libraryNavigation.generation += 1;
  if (libraryNavigation.restoring || libraryNavigation.cursor < 0) return;
  const entry = { id: ++libraryNavigation.sequence, view: libraryViewConfig() };
  libraryNavigation.order.splice(libraryNavigation.cursor + 1).forEach((id) => libraryNavigation.entries.delete(id));
  libraryNavigation.order.push(entry.id); libraryNavigation.cursor += 1;
  libraryNavigation.entries.set(entry.id, entry);
  // Only six recently rendered pages retain metadata/visuals; older browser
  // entries keep their lightweight route and can reload it when revisited.
  for (const [id, cached] of libraryNavigation.entries) {
    if (id < entry.id - 6) { cached.data = null; cached.visual = null; }
  }
  try {
    history.pushState({ ...history.state, driveOriginalNavigation: {
      epoch: libraryNavigation.epoch, id: entry.id, owner: libraryNavigationOwner(), view: entry.view
    } }, '', location.href);
  } catch (_) { /* Folder navigation still works when history storage is unavailable. */ }
}

function resetLibraryNavigation() {
  cancelLibraryEdgeBack();
  libraryNavigation.generation += 1;
  libraryNavigation.entries.clear(); libraryNavigation.order = []; libraryNavigation.cursor = -1;
  libraryNavigation.pending = false;
}

async function restoreLibraryNavigation(target) {
  if (!target || target.owner !== libraryNavigationOwner() || state.accountIdentityPending) return;
  const entry = target.epoch === libraryNavigation.epoch ? libraryNavigation.entries.get(target.id) : null;
  const view = entry?.view || target.view;
  if (!view || !['all','video','image','favorites'].includes(view.filter) || !view.currentFolderId) return;
  cancelLibraryEdgeBack();
  libraryNavigation.pending = false;
  libraryNavigation.generation += 1;
  const navigationGeneration = libraryNavigation.generation;
  libraryNavigation.restoring = true;
  try {
    if (!el.playerSheet?.hidden) closePlayer();
    cancelFavoriteLoad(); resetListingSession();
    state.currentFolderId = view.currentFolderId; state.currentFolderName = view.currentFolderName;
    state.folderStack = (view.folderStack || []).map((item) => ({ ...item }));
    state.filter = view.filter; state.query = view.query || ''; state.sort = view.sort || 'modifiedTime'; state.deepScan = Boolean(view.deepScan);
    state.folderRenderLimit = view.folderRenderLimit || FOLDER_RENDER_MAX;
    if (el.searchInput) el.searchInput.value = state.query;
    if (el.sortSelect) el.sortSelect.value = state.sort;
    el.filterButtons?.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter)));
    syncDeepScanToggle();
    const data = entry?.data;
    const cached = data?.complete && data.revision === (libraryNavigation.dataRevision || 0);
    if (cached) {
      state.files = data.files; state.folders = data.folders;
      state.favoriteFiles = data.favoriteFiles.filter((file) => isFavoriteFileId(file.id));
      state.nextPageToken = data.nextPageToken; state.populationComplete = data.populationComplete;
      state.listLoadError = Boolean(data.listLoadError); state.listPageTokens = new Set(data.listPageTokens || []);
      shuffledOrderMap = new Map(data.order);
      state.renderWindowStart = view.renderWindowStart || 0; state.renderRowHeight = view.renderRowHeight || 250;
      renderFiles();
    } else {
      renderFiles({ resetWindow: true });
      if (state.filter === 'favorites') await loadFavoriteFiles();
      else await applyFolderView();
    }
    if (navigationGeneration !== libraryNavigation.generation) return;
    const index = libraryNavigation.order.indexOf(target.id);
    if (entry && index >= 0) libraryNavigation.cursor = index;
    else { libraryNavigation.cursor = -1; libraryNavigation.order = []; libraryNavigation.entries.clear(); }
    window.scrollTo({ top: Math.max(0, view.scrollY || 0), behavior: 'instant' });
    requestAnimationFrame(() => {
      if (navigationGeneration === libraryNavigation.generation) {
        window.scrollTo({ top: Math.max(0, view.scrollY || 0), behavior: 'instant' });
        scheduleRenderWindowUpdate();
      }
    });
  } finally { libraryNavigation.restoring = false; }
}

function hasOwnedLibraryBackEntry() {
  const mark = typeof history !== 'undefined' ? history.state?.driveOriginalNavigation : null;
  return libraryNavigation.cursor > 0 && mark?.epoch === libraryNavigation.epoch
    && mark.id === libraryNavigation.order[libraryNavigation.cursor] && mark.owner === libraryNavigationOwner();
}

function canNavigateLibraryBack() {
  return hasOwnedLibraryBackEntry() || state.filter === 'favorites' || state.currentFolderId !== 'root' || state.folderStack.length > 0;
}

function prefersNativeLibraryBack() {
  // Home-screen WebKit can also own the OS edge gesture. Never run a second
  // page animation in the reserved strip merely because display-mode changed.
  return Boolean(isIOSWebKitDevice() && (hasOwnedLibraryBackEntry() || hasOwnedPlayerEntry()));
}

function isIOSWebKitDevice() {
  return /iP(?:hone|ad|od)/.test(navigator.userAgent || '')
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isReservedBackStart(x) {
  return x >= 0 && x <= (isIOSWebKitDevice() ? 32 : 18);
}

let playerHistoryPending = false;
let playerHistoryGeneration = 0;

function hasOwnedPlayerEntry() {
  const mark = typeof history !== 'undefined' ? history.state?.driveOriginalPlayer : null;
  return Boolean(mark && mark.epoch === libraryNavigation.epoch && mark.owner === libraryNavigationOwner());
}

function pushPlayerHistory(file) {
  if (typeof history === 'undefined' || typeof history.pushState !== 'function' || hasOwnedPlayerEntry()) return;
  beginLibraryNavigation();
  try {
    history.pushState({ ...history.state, driveOriginalPlayer: {
      epoch: libraryNavigation.epoch, owner: libraryNavigationOwner(), fileId: file.id
    } }, '', location.href);
  } catch (_) { /* Closing remains available if history storage is denied. */ }
}

function requestClosePlayer() {
  if (playerHistoryPending || el.playerSheet?.hidden) return;
  if (hasOwnedPlayerEntry()) {
    const generation = ++playerHistoryGeneration;
    playerHistoryPending = true;
    closePlayer({ preserveHistory: true });
    history.back();
    // A slow popstate must not produce a second back.
    setTimeout(() => { if (generation === playerHistoryGeneration) playerHistoryPending = false; }, 800);
  } else closePlayer();
}

function libraryEdgeReleaseDecision(distance, velocity, width) {
  const dx = Math.max(0, Number(distance) || 0);
  const v = Number(velocity) || 0;
  // A deliberate reversal is a cancellation even after a long outward drag.
  if (v < -0.18) return false;
  return dx >= Math.max(88, width * 0.36) || (dx >= 48 && v >= 0.48 && dx + v * 180 >= width * 0.34);
}

function clearLibraryEdgeBackVisuals() {
  // Invalidate even an already-fulfilled animation's queued callback before
  // cancelling its animation/timer. Promise fulfillment cannot be cancelled.
  libraryNavigation.edgeTransition = null;
  libraryNavigation.animations.splice(0).forEach((animation) => animation.cancel?.());
  clearTimeout(libraryNavigation.timer); libraryNavigation.timer = null;
  libraryNavigation.edge?.remove?.(); libraryNavigation.edge = null;
  if (el.edgeBackIndicator) el.edgeBackIndicator.hidden = true;
  if (el.libraryView) {
    el.libraryView.style.transform = ''; el.libraryView.style.opacity = ''; el.libraryView.style.willChange = '';
  }
  if (el.playerSheet?.style) el.playerSheet.style.transform = '';
}

function cancelLibraryEdgeBack() {
  edgeBackGesture = null;
  clearLibraryEdgeBackVisuals();
}

function invalidateLibraryNavigationData() {
  libraryNavigation.dataRevision = (libraryNavigation.dataRevision || 0) + 1;
  libraryNavigation.entries.forEach((entry) => { entry.data = null; entry.visual = null; });
}

function completeLibraryBackNavigation() {
  clearLibraryEdgeBackVisuals();
  if (libraryNavigation.pending) return;
  if (hasOwnedLibraryBackEntry()) {
    rememberLibraryView();
    libraryNavigation.pending = true;
    history.back();
    // Do not invent a second navigation when a browser is slow. The timeout
    // only releases the interaction guard; popstate is the sole commit owner.
    setTimeout(() => { libraryNavigation.pending = false; }, 800);
  } else if (state.filter === 'favorites') setLibraryFilter('all');
  else navigateToParentFolder();
}

function prepareLibraryEdgeVisual(gesture) {
  if (gesture.player) { gesture.cover = el.playerSheet; return; }
  const current = captureLibraryVisual();
  const previous = previousLibraryEntry()?.visual;
  if (!current || !previous || previous.width !== window.innerWidth || previous.height !== window.innerHeight) return;
  const layer = document.createElement('div'); layer.className = 'library-edge-transition'; layer.inert = true; layer.setAttribute('aria-hidden','true');
  const top = document.querySelector('.topbar')?.getBoundingClientRect().bottom || 0;
  layer.style.clipPath = `inset(${Math.max(0, top)}px 0 0 0)`;
  const under = previous.node.cloneNode(true); under.classList.add('edge-under');
  const cover = current.node; cover.classList.add('edge-over');
  const shade = document.createElement('div'); shade.className = 'edge-shade'; under.appendChild(shade);
  layer.append(under, cover); document.body.appendChild(layer);
  libraryNavigation.edge = layer; gesture.cover = cover; gesture.under = under; gesture.shade = shade;
}

function drawLibraryEdgeVisual(gesture) {
  const offset = Math.max(0, Math.min(gesture.width, gesture.distance));
  const progress = offset / gesture.width;
  if (gesture.cover) {
    gesture.cover.style.transform = `translate3d(${offset}px,0,0)`;
    if (gesture.under) gesture.under.style.transform = `translate3d(${-gesture.width * .25 * (1-progress)}px,0,0)`;
    if (gesture.shade) gesture.shade.style.opacity = String(.22 * (1-progress));
  } else if (el.libraryView) {
    // An evicted or orientation-mismatched prior view is never fabricated.
    // Use the same direct tracking with a neutral back affordance instead.
    el.libraryView.style.transform = `translate3d(${offset}px,0,0)`;
    if (el.edgeBackIndicator) {
      el.edgeBackIndicator.hidden = false;
      el.edgeBackIndicator.style.opacity = String(Math.min(1, progress * 4));
    }
  }
}

function settleLibraryEdgeBack(commit, gesture = edgeBackGesture) {
  if (!gesture) { clearLibraryEdgeBackVisuals(); return; }
  edgeBackGesture = null;
  const generation = libraryNavigation.generation;
  const transition = {};
  libraryNavigation.edgeTransition = transition;
  const finish = () => {
    if (generation !== libraryNavigation.generation || libraryNavigation.edgeTransition !== transition) return;
    clearLibraryEdgeBackVisuals();
    if (commit && !document.querySelector('dialog[open]')) {
      if (gesture.player && !el.playerSheet?.hidden && gesture.playbackSession === state.playbackSession) requestClosePlayer();
      else if (!gesture.player && el.playerSheet?.hidden) completeLibraryBackNavigation();
    }
  };
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cover = gesture.cover || el.libraryView;
  if (reduced || typeof cover?.animate !== 'function') { finish(); return; }
  const distance = Math.max(0, Math.min(gesture.width, gesture.distance));
  const duration = commit ? Math.max(120, Math.min(260, (gesture.width-distance)/Math.max(.8, gesture.velocity))) : 220;
  const options = {duration,easing:'cubic-bezier(0.22,0.8,0.2,1)',fill:'forwards'};
  const animation = cover.animate([{transform:`translate3d(${distance}px,0,0)`},{transform:`translate3d(${commit?gesture.width:0}px,0,0)`}],options);
  libraryNavigation.animations.push(animation);
  if (gesture.under) libraryNavigation.animations.push(gesture.under.animate([
    {transform:gesture.under.style.transform},{transform:`translate3d(${commit?0:-gesture.width*.25}px,0,0)`}
  ],options));
  if (gesture.shade) libraryNavigation.animations.push(gesture.shade.animate([
    {opacity:gesture.shade.style.opacity},{opacity:commit?0:.22}
  ],options));
  // Cancelled animations never navigate. A deadline handles suspended WAAPI
  // promises; identity and generation guards still own the final transition.
  animation.finished.then(finish, () => {});
  libraryNavigation.timer = setTimeout(finish, duration + 80);
}

function setupLibraryEdgeBackGesture() {
  const valid = (gesture) => gesture && gesture.generation === libraryNavigation.generation
    && gesture.listGeneration === state.listGeneration && gesture.folder === state.currentFolderId
    && gesture.filter === state.filter
    && (gesture.player ? !el.playerSheet?.hidden && gesture.playbackSession === state.playbackSession : el.playerSheet?.hidden)
    && !el.libraryView?.hidden && !document.querySelector('dialog[open]');
  const findTouch = (touches, id) => Array.from(touches || []).find((touch) => (touch.identifier ?? 0) === id);
  const sample = (gesture, touch) => {
    const now = performance.now(); gesture.distance = touch.clientX - gesture.startX;
    gesture.samples.push({x:touch.clientX,t:now});
    gesture.samples = gesture.samples.filter((point) => now-point.t <= 100);
    const first = gesture.samples[0];
    gesture.velocity = first && now>first.t ? (touch.clientX-first.x)/(now-first.t) : 0;
  };
  document.addEventListener('touchstart', (event) => {
    if (!edgeBackGesture && !libraryNavigation.animations.length) libraryNavigation.suppressClickUntil = 0;
    if (event.touches.length !== 1) { if(edgeBackGesture) settleLibraryEdgeBack(false); return; }
    if (edgeBackGesture || libraryNavigation.animations.length || libraryNavigation.pending || libraryNavigation.restoring) return;
    if (!isMobileDevice() || !el.libraryView || el.libraryView.hidden || playerHistoryPending) return;
    const player = !el.playerSheet?.hidden;
    if ((!player && !canNavigateLibraryBack()) || document.querySelector('dialog[open]')) return;
    const touch = event.touches[0];
    if (touch.clientX < 0 || touch.clientX > 18 || (window.visualViewport?.scale || 1) > 1.05) return;
    // Safari owns its physical-edge interactive back gesture. Same-document
    // history restores the identical app view without a competing custom pop.
    if (prefersNativeLibraryBack()) return;
    if (event.target.closest?.('input,textarea,select,button,a,[role="slider"],[contenteditable="true"]')) return;
    edgeBackGesture = { id:touch.identifier??0,startX:touch.clientX,startY:touch.clientY,
      player, playbackSession:state.playbackSession,
      width:window.innerWidth||el.libraryView.clientWidth||400,generation:libraryNavigation.generation,
      listGeneration:state.listGeneration,folder:state.currentFolderId,filter:state.filter,
      locked:false,distance:0,velocity:0,samples:[{x:touch.clientX,t:performance.now()}] };
  },{passive:true});
  document.addEventListener('touchmove', (event) => {
    const gesture=edgeBackGesture;
    if (!gesture) return;
    if (!valid(gesture) || event.touches.length!==1) { settleLibraryEdgeBack(false,gesture); return; }
    const touch=findTouch(event.touches,gesture.id);
    if (!touch) { settleLibraryEdgeBack(false,gesture); return; }
    const dx=touch.clientX-gesture.startX,dy=touch.clientY-gesture.startY;
    if (!gesture.locked) {
      if(Math.hypot(dx,dy)<12)return;
      if(dx<=0 || Math.abs(dy)>dx*.65){cancelLibraryEdgeBack();return;}
      if(event.cancelable===false){cancelLibraryEdgeBack();return;}
      gesture.locked=true;prepareLibraryEdgeVisual(gesture);
    }
    if(event.cancelable===false){settleLibraryEdgeBack(false,gesture);return;}
    event.preventDefault();sample(gesture,touch);drawLibraryEdgeVisual(gesture);
  },{passive:false});
  document.addEventListener('touchend',(event)=>{
    const gesture=edgeBackGesture;if(!gesture)return;
    const touch=findTouch(event.changedTouches,gesture.id);
    if(!touch)return;
    if(!valid(gesture)||!gesture.locked||event.touches?.length){settleLibraryEdgeBack(false,gesture);return;}
    sample(gesture,touch);
    libraryNavigation.suppressClickUntil=performance.now()+400;
    settleLibraryEdgeBack(libraryEdgeReleaseDecision(gesture.distance,gesture.velocity,gesture.width),gesture);
  },{passive:true});
  document.addEventListener('touchcancel',()=>{if(edgeBackGesture)settleLibraryEdgeBack(false);},{passive:true});
  document.addEventListener('click',(event)=>{
    if (event.sourceCapabilities?.firesTouchEvents === false) return;
    if(event.detail!==0 && performance.now()<libraryNavigation.suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  document.addEventListener('pointerdown', () => {
    if (!edgeBackGesture && !libraryNavigation.animations.length) libraryNavigation.suppressClickUntil = 0;
  }, { passive: true });
  window.addEventListener('popstate',(event)=>{
    const target=event.state?.driveOriginalNavigation;
    cancelLibraryEdgeBack();
    playerHistoryGeneration += 1;
    playerHistoryPending = false;
    if (event.state?.driveOriginalPlayer && hasOwnedPlayerEntry()) {
      const file = getPlaybackFileById(event.state.driveOriginalPlayer.fileId);
      if (file && el.playerSheet?.hidden) openPlayer(file);
      return;
    }
    if (!el.playerSheet?.hidden) closePlayer({ preserveHistory: true });
    if (target?.epoch === libraryNavigation.epoch && target.id === libraryNavigation.order[libraryNavigation.cursor]
      && target.owner === libraryNavigationOwner()) return;
    if(target)restoreLibraryNavigation(target).catch((error)=>{
      libraryNavigation.pending=false;
      if(error?.name!=='AbortError')showToast('이전 화면을 복원하지 못했습니다. 새로고침으로 다시 불러오세요.');
    });
  });
  window.addEventListener('resize',cancelLibraryEdgeBack,{passive:true});
  window.addEventListener('blur',cancelLibraryEdgeBack);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')cancelLibraryEdgeBack();});
}

/* Deep Scan — 현재 폴더 + 모든 하위 폴더의 미디어를 한 번에 로딩 */
async function applyFolderView() {
  if (state.demo) {
    startDemoMode();
    return;
  }
  if (state.deepScan) {
    const folderId = state.currentFolderId, generation = state.listGeneration, filter = state.filter;
    const cache = await ensureTreeCache(folderId);
    if (cache && state.deepScan && folderId === state.currentFolderId && generation === state.listGeneration && filter === state.filter) computeAndRenderSubtree();
    return;
  }
  const generation = state.listGeneration + 1;
  const loaded = await loadFiles({ append: false });
  if (!loaded || generation !== state.listGeneration || state.sort !== 'random') return;
  await shuffleWholeFolder(generation);
}

// Random order needs the whole folder; a newer listing, sort or filter wins.
async function shuffleWholeFolder(generation) {
  const filterAtStart = state.filter;
  const statusToken = beginLibraryStatus('대상 폴더의 전체 미디어를 모아 무작위로 섞는 중…');
  try {
    await ensureAllPagesLoaded({ statusToken });
    if (generation !== state.listGeneration || state.sort !== 'random' || state.filter !== filterAtStart) return;
    shuffleCurrentFiles();
    renderFiles({ resetWindow: true });
    updateLibraryStatus(statusToken, '');
  } catch (error) {
    if (error?.name !== 'AbortError') {
      updateLibraryStatus(statusToken, `전체 파일을 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    }
  }
}

function treeCacheCoversFolder(cache, folderId = state.currentFolderId) {
  return Boolean(cache && (!cache.scannedFolderIds || cache.scannedFolderIds.has(folderId)
    || (folderId === 'root' && cache.scannedFolderIds.has(state.rootFolderId))));
}

async function ensureTreeCache(folderId = state.currentFolderId) {
  if (state.treeCachePromise && (state.treeCachePromise.folderId !== folderId || state.treeAbort?.signal.aborted)) {
    state.treeAbort?.abort();
    await state.treeCachePromise;
    if (folderId !== state.currentFolderId) return;
    return ensureTreeCache(folderId);
  }
  if (treeCacheCoversFolder(state.treeCache, folderId)) return state.treeCache;
  if (state.treeCachePromise) return state.treeCachePromise;
  const promise = collectTreeCache(folderId);
  promise.folderId = folderId;
  state.treeCachePromise = promise;
  try {
    return await promise;
  } finally {
    if (state.treeCachePromise === promise) state.treeCachePromise = null;
  }
}

async function collectTreeCache(folderId = state.currentFolderId) {
  if (!hasUsableToken()) {
    showReconnectState();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return;
  }
  state.loadingTree = true;
  const controller = new AbortController();
  state.treeAbort = controller;
  const accountGeneration = state.driveSessionGeneration, listingGeneration = state.listGeneration;
  const ownsAccount = () => accountGeneration === state.driveSessionGeneration && state.treeAbort === controller;
  const ownsView = () => ownsAccount() && folderId === state.currentFolderId && listingGeneration === state.listGeneration;
  const assertCurrent = () => {
    if (controller.signal.aborted || !ownsAccount()) throw new DOMException('Folder scan cancelled', 'AbortError');
  };
  const scopeName = state.currentFolderName || '현재 폴더';
  if (el.deepScanToggle) el.deepScanToggle.disabled = true;
  if (el.deepScanStopBtn) {
    el.deepScanStopBtn.hidden = false;
    el.deepScanStopBtn.setAttribute('aria-label', `${scopeName} 하위 폴더 탐색 중지`);
  }
  const statusToken = beginLibraryStatus(`${scopeName} 및 하위 폴더를 탐색하는 중…`);
  try {
    const knownFolder = state.treeCache?.foldersById.get(folderId)
      || state.folderIndex?.folders?.find(folder => folder.id === folderId)
      || [...libraryNavigation.entries.values()].flatMap(entry => entry.data?.folders || []).find(folder => folder.id === folderId);
    const resourceKeys = buildResourceKeysHeader([knownFolder]);
    const rootParams = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name,mimeType,parents,driveId,resourceKey' });
    const rootResponse = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?${rootParams}`, {
      signal: controller.signal, headers: resourceKeys ? { 'X-Goog-Drive-Resource-Keys': resourceKeys } : {}
    });
    const root = await rootResponse.json();
    assertCurrent();
    if (!root?.id || root.mimeType !== FOLDER_MIME || (folderId !== 'root' && root.id !== folderId)) {
      throw new Error('탐색할 폴더 정보를 확인하지 못했습니다.');
    }
    if (folderId === 'root') state.rootFolderId = root.id;
    // A Drive root has no parent; keep its metadata outside the visible root
    // children rather than interpreting the missing parent as the 'root' alias.
    const items = [{ ...root, parents: root.parents?.length ? root.parents : ['__drive_tree_boundary__'] }];
    const scannedFolderIds = new Set();
    let listedItems = 0;
    const listFolder = async (folder) => {
      const files = [];
      let pageToken = null;
      const seenPageTokens = new Set();
      do {
        assertCurrent();
        const params = folderListingParams(folder.id);
        params.set('corpora', folder.driveId || root.driveId ? 'drive' : 'user');
        if (folder.driveId || root.driveId) params.set('driveId', folder.driveId || root.driveId);
        if (pageToken) params.set('pageToken', pageToken);
        const keys = buildResourceKeysHeader([folder]);
        const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, {
          signal: controller.signal, headers: keys ? { 'X-Goog-Drive-Resource-Keys': keys } : {}
        });
        const data = await response.json();
        assertCurrent();
        if (!Array.isArray(data.files) || (data.nextPageToken != null && typeof data.nextPageToken !== 'string')
          || data.files.some(item => !item?.id || !Array.isArray(item.parents) || !item.parents.includes(folder.id))) {
          throw new Error('Google Drive가 올바른 폴더 목록을 반환하지 않았습니다.');
        }
        files.push(...data.files);
        if (data.incompleteSearch) {
          throw new Error('Google Drive가 폴더 목록을 완전하게 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.');
        }
        const next = data.nextPageToken || null;
        if (next && seenPageTokens.has(next)) throw new Error('Drive가 같은 페이지 토큰을 반복했습니다.');
        if (next) seenPageTokens.add(next);
        pageToken = next;
        listedItems += data.files.length;
        updateLibraryStatus(statusToken, `${scopeName} 및 하위 폴더 탐색 중… ${listedItems.toLocaleString('ko-KR')}개 항목 · ${scannedFolderIds.size.toLocaleString('ko-KR')}개 폴더 확인`);
      } while (pageToken);
      return files;
    };
    // Folders of one depth are listed concurrently. Their items and the next
    // depth are assembled in the serial breadth-first order, so the result
    // never depends on which response arrives first.
    const stopped = Symbol('deep scan stopped after another folder failed');
    let level = [root];
    while (level.length) {
      const folders = level.filter((folder) => !scannedFolderIds.has(folder.id) && scannedFolderIds.add(folder.id));
      let failed = false;
      const listings = await runTaskPool(folders, async (folder) => {
        if (failed) throw stopped;
        try { return await listFolder(folder); } catch (error) { failed = true; throw error; }
      }, DEEP_SCAN_CONCURRENCY);
      const failure = listings.find((listing) => listing.status === 'rejected' && listing.reason !== stopped);
      if (failure) throw failure.reason;
      level = [];
      listings.forEach(({ value: files }) => {
        items.push(...files);
        level.push(...files.filter(item => item.mimeType === FOLDER_MIME));
      });
    }
    assertCurrent();
    if (folderId === 'root') scannedFolderIds.add('root');
    const previous = state.treeCache;
    const retained = (previous?.items || []).filter(item => !scannedFolderIds.has(item.parents?.[0]) && item.id !== root.id);
    const coverage = previous && !previous.scannedFolderIds ? null : new Set([...(previous?.scannedFolderIds || []), ...scannedFolderIds]);
    state.treeCache = buildTreeIndexes(dedupeFiles([...retained, ...items]), coverage);
    updateLibraryStatus(statusToken, '');
    return state.treeCache;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      if (!ownsView()) return;
      // 사용자가 중지 버튼으로 취소 — 부분 데이터는 폐기하고 일반 모드로 복귀한다.
      updateLibraryStatus(statusToken, `${scopeName} 하위 폴더 탐색을 중단했습니다.`);
      state.deepScan = false;
      syncDeepScanToggle();
      if (state.filter !== 'favorites') await applyFolderView();
      return;
    }
    if (!ownsView()) return;
    reportAppFailure('library-tree', error);
    updateLibraryStatus(statusToken, `하위 폴더 전체를 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    if (error.status === 401) {
      clearRejectedToken(error);
      showReconnectState();
    }
    state.deepScan = false;
    syncDeepScanToggle();
  } finally {
    if (state.treeAbort === controller) {
      state.loadingTree = false;
      state.treeAbort = null;
      if (el.deepScanToggle) el.deepScanToggle.disabled = false;
      if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = true;
    }
  }
}

function buildTreeIndexes(items, scannedFolderIds = null) {
  const foldersById = new Map();
  const foldersByParent = new Map();
  const mediaByParent = new Map();
  items.forEach((item) => {
    const parent = item.parents?.[0] || 'root';
    if (item.mimeType === FOLDER_MIME) {
      foldersById.set(item.id, item);
      if (!foldersByParent.has(parent)) foldersByParent.set(parent, []);
      foldersByParent.get(parent).push(item);
    } else {
      if (!mediaByParent.has(parent)) mediaByParent.set(parent, []);
      mediaByParent.get(parent).push(item);
    }
  });
  return { items, foldersById, foldersByParent, mediaByParent, scannedFolderIds };
}

function isSupportedMediaFile(file) {
  return Boolean(file?.id && !file.trashed && file.mimeType !== FOLDER_MIME
    && (file.mimeType?.startsWith('video/') || file.mimeType?.startsWith('image/')));
}

function decorateFavoriteMediaFile(file, catalog, rootFolderId = null) {
  if (!file) return file;
  const parent = file.parents?.[0] || 'root';
  file.__origin = catalog?.foldersById?.get(parent)?.name
    || (parent === rootFolderId || parent === 'root' ? '내 드라이브' : file.__origin || '');
  return file;
}

function collectFavoriteMediaFromCatalog(catalog, favoriteIds, rootFolderId = null) {
  const favorites = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || []);
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return dedupeFiles(items.filter((file) => isSupportedMediaFile(file) && favorites.has(file.id)))
    .map((file) => decorateFavoriteMediaFile(file, catalog, rootFolderId));
}

function collectKnownFavoriteMedia(sources, favoriteIds, catalog = null, rootFolderId = null) {
  const favorites = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || []);
  const knownById = new Map();
  (Array.isArray(sources) ? sources : []).forEach((source) => {
    (Array.isArray(source) ? source : []).forEach((file) => {
      if (isSupportedMediaFile(file) && favorites.has(file.id) && !knownById.has(file.id)) {
        knownById.set(file.id, file);
      }
    });
  });
  const files = [];
  const missingIds = [];
  favorites.forEach((fileId) => {
    const file = knownById.get(fileId);
    if (file) files.push(decorateFavoriteMediaFile(file, catalog, rootFolderId));
    else missingIds.push(fileId);
  });
  return { files, missingIds };
}

function effectiveRootId() {
  if (state.currentFolderId !== 'root') return state.currentFolderId;
  return state.rootFolderId || 'root';
}

function computeAndRenderSubtree() {
  const cache = state.treeCache;
  if (!treeCacheCoversFolder(cache)) return;
  // 'root' 별칭과 실제 루트 폴더 ID 양쪽에서 직계 자식이 붙어 있을 수 있어 둘 다 탐색
  const rootIds = new Set([effectiveRootId()]);
  if (state.currentFolderId === 'root') rootIds.add('root');
  const queue = [...rootIds];
  const visited = new Set();
  const media = [];
  while (queue.length) {
    const folderId = queue.shift();
    if (visited.has(folderId)) continue;
    visited.add(folderId);
    (cache.mediaByParent.get(folderId) || []).forEach((file) => media.push(file));
    if (state.deepScan) {
      (cache.foldersByParent.get(folderId) || []).forEach((folder) => queue.push(folder.id));
    }
  }
  media.forEach((file) => {
    const parent = file.parents?.[0] || 'root';
    const origin = cache.foldersById.get(parent);
    file.__origin = rootIds.has(parent) ? '' : (origin?.name || '');
  });
  const current = cache.foldersById.get(state.currentFolderId);
  if (current?.name) state.currentFolderName = current.name;
  state.folders = dedupeFiles([...rootIds].flatMap((id) => cache.foldersByParent.get(id) || []));
  state.files = dedupeFiles(media);
  state.nextPageToken = null;
  state.populationComplete = true;
  shuffledOrderMap.clear();
  renderFiles({ resetWindow: true });
  clearLibraryStatus();
  updateLibrarySummary();
}

async function setLibraryFilter(filter) {
  const next = ['all', 'video', 'image', 'favorites'].includes(filter) ? filter : 'all';
  if (next !== state.filter) {
    beginLibraryNavigation();
    exitSelectionMode();
    shuffledOrderMap.clear();
  }
  if (next !== 'favorites') cancelFavoriteLoad();
  const changed = state.filter !== next;
  state.filter = next;
  if (changed) commitLibraryNavigation();
  clearLibraryStatus();
  el.filterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === next));
  });
  if (next === 'favorites') {
    await loadFavoriteFiles();
  } else if (state.deepScan && !state.loadingTree) {
    await applyFolderView();
  } else {
    renderFiles({ resetWindow: true });
  }
}

function cancelFavoriteLoad() {
  state.favoriteLoadGeneration += 1;
  state.favoriteAbortController?.abort();
  state.favoriteAbortController = null;
  state.loadingFavorites = false;
  state.favoriteLoadPromise = null;
}

function loadFavoriteFiles(options = {}) {
  if (state.favoriteLoadPromise) return state.favoriteLoadPromise;
  const operation = performFavoriteLoad(options);
  state.favoriteLoadPromise = operation;
  operation.finally(() => {
    if (state.favoriteLoadPromise === operation) state.favoriteLoadPromise = null;
  }).catch(() => {});
  return operation;
}

async function performFavoriteLoad({ refreshState = true, preserveWindow = false } = {}) {
  state.favoriteAbortController?.abort();
  const controller = new AbortController();
  const generation = state.favoriteLoadGeneration + 1;
  state.favoriteLoadGeneration = generation;
  state.favoriteAbortController = controller;
  state.loadingFavorites = true;
  renderFiles({ resetWindow: !preserveWindow });
  const statusToken = beginLibraryStatus('계정의 좋아요 항목을 모든 폴더에서 모으는 중…');
  let nextFiles = [];
  let nextStatus = '';
  // An abort from another owner (credential loss, account-state reset) keeps
  // this generation current; it must not read as "no favorites".
  let committed = false;
  try {
    let syncError = null;
    try {
      await initializeAccountMediaState({ refresh: refreshState });
    } catch (error) {
      if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.favoriteLoadGeneration) return;
      syncError = error;
      state.accountStateSyncError = error;
      reportAppFailure('account-state-refresh', error, 'warn');
    }
    if (controller.signal.aborted || generation !== state.favoriteLoadGeneration || state.filter !== 'favorites') return;
    const favoriteIds = accountFavoriteIds(state.accountMediaState);
    const catalog = state.treeCache;
    const known = collectKnownFavoriteMedia([
      catalog?.items,
      state.favoriteFiles,
      state.files,
      state.selected ? [state.selected] : []
    ], favoriteIds, catalog, state.rootFolderId);
    const results = await runTaskPool(known.missingIds, async (fileId) => {
      const params = new URLSearchParams({
        supportsAllDrives: 'true',
        fields: MEDIA_FILE_FIELDS
      });
      const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params.toString()}`, {
        signal: controller.signal,
        driveMaxRateAttempts: 2
      });
      return response.json();
    }, BULK_ACTION_CONCURRENCY);
    if (controller.signal.aborted || generation !== state.favoriteLoadGeneration || state.filter !== 'favorites') return;
    const fetched = results
      .filter((result) => result.status === 'fulfilled' && isSupportedMediaFile(result.value))
      .map((result) => decorateFavoriteMediaFile(result.value, catalog, state.rootFolderId));
    nextFiles = dedupeFiles([...known.files, ...fetched]);
    const failedCount = results.filter((result) => result.status === 'rejected').length;
    if (failedCount) {
      nextStatus = `좋아요 ${favoriteIds.size.toLocaleString('ko-KR')}개 중 ${failedCount.toLocaleString('ko-KR')}개를 불러오지 못했습니다. 연결 상태와 파일 권한을 확인하세요.`;
    } else if (syncError) {
      nextStatus = '이 기기에 저장된 좋아요를 표시했습니다. 다른 기기와 동기화하려면 Google Drive를 다시 연결하세요.';
    }
    committed = true;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.favoriteLoadGeneration) return;
    reportAppFailure('favorite-files-load', error);
    nextStatus = `좋아요 항목을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    committed = true;
  } finally {
    if (generation === state.favoriteLoadGeneration && state.filter === 'favorites') {
      if (!committed) {
        nextFiles = state.favoriteFiles;
        nextStatus = '좋아요 항목을 불러오는 작업이 중단되었습니다. 새로고침해 다시 시도하세요.';
      }
      // A remote/local unlike may arrive while metadata is in flight.
      state.favoriteFiles = nextFiles.filter((file) => isFavoriteFileId(file.id));
      state.loadingFavorites = false;
      state.favoriteAbortController = null;
      renderFiles({ resetWindow: !preserveWindow });
      updateLibraryStatus(statusToken, nextStatus);
    }
  }
}

function toggleDeepScan() {
  if (state.loadingTree) return;
  state.deepScan = !state.deepScan;
  syncDeepScanToggle();
  resetListingSession();
  scrollToLibraryTop();
  animateFolderTransition(state.deepScan ? 'forward' : 'back');
  if (state.deepScan) {
    showToast('현재 폴더와 모든 하위 폴더의 미디어를 함께 불러옵니다.');
  }
  applyFolderView();
}

function syncDeepScanToggle() {
  if (!el.deepScanToggle) return;
  el.deepScanToggle.setAttribute('aria-pressed', String(state.deepScan));
  el.deepScanToggle.classList.toggle('active', state.deepScan);
}

function scrollToLibraryTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function animateFolderTransition(direction) {
  const targets = [el.fileGrid, el.folderStrip].filter(Boolean);
  if (!targets.length) return;
  targets.forEach((node) => {
    node.classList.remove('folder-enter-forward', 'folder-enter-back');
    void node.offsetWidth;
    node.classList.add(direction === 'forward' ? 'folder-enter-forward' : 'folder-enter-back');
  });
}

function renderBreadcrumb() {
  if (!el.breadcrumbTrail || !el.libraryTitle) return;
  if (el.deepScanToggle) el.deepScanToggle.hidden = state.filter === 'favorites';
  if (state.filter === 'favorites') {
    el.libraryTitle.textContent = '좋아요';
    el.breadcrumbTrail.replaceChildren();
    const crumb = document.createElement('span');
    crumb.className = 'crumb current';
    crumb.textContent = '모든 폴더';
    el.breadcrumbTrail.appendChild(crumb);
    if (el.folderUpButton) el.folderUpButton.hidden = true;
    return;
  }
  el.libraryTitle.textContent = state.currentFolderName;
  const crumbs = buildBreadcrumbItems(state.folderStack, state.currentFolderId, state.currentFolderName);
  el.breadcrumbTrail.replaceChildren();
  crumbs.forEach((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    const chip = document.createElement(isLast ? 'span' : 'button');
    chip.className = `crumb ${isLast ? 'current' : ''}`.trim();
    chip.textContent = crumb.name;
    if (!isLast) {
      chip.type = 'button';
      chip.setAttribute('aria-label', `${crumb.name}(으)로 이동`);
      chip.addEventListener('click', () => navigateToFolderIndex(index));
    }
    el.breadcrumbTrail.appendChild(chip);
    if (!isLast) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '/';
      el.breadcrumbTrail.appendChild(sep);
    }
  });
  if (el.folderUpButton) el.folderUpButton.hidden = state.currentFolderId === 'root' && state.folderStack.length === 0;
}

