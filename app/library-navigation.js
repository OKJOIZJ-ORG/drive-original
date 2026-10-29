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
    subfolderSelection: cloneSubfolderSelection(state.subfolderSelection),
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
    state.subfolderSelection = cloneSubfolderSelection(view.subfolderSelection);
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

/* Subfolder inclusion (D119) — the current folder's media plus the subfolders
   the user chose. A choice covers that folder's whole subtree unless a deeper
   folder is chosen differently; `all` is the default for direct children.
   marks: folderId -> { on, path } where path lists the ancestors between the
   chosen root and that folder, so a deeper choice can be reached. */
function cloneSubfolderSelection(selection) {
  if (!selection) return null;
  return {
    rootId: selection.rootId,
    all: Boolean(selection.all),
    marks: new Map([...(selection.marks || [])].map(([id, mark]) => [id, { on: Boolean(mark.on), path: [...(mark.path || [])] }]))
  };
}

function isWholeSubfolderSelection(selection) {
  return !selection || (selection.all && !selection.marks.size);
}

// A whole-subtree choice follows the user into other folders; a hand-picked
// one belongs to the folder it was made in.
function subfolderSelectionFor(folderId = state.currentFolderId) {
  if (!state.deepScan) return null;
  const selection = state.subfolderSelection;
  if (isWholeSubfolderSelection(selection)) return { rootId: folderId, all: true, marks: new Map() };
  return selection.rootId === folderId ? selection : null;
}

function subfolderSelectionKey(selection) {
  if (!selection) return '';
  const marks = [...selection.marks].map(([id, mark]) => `${id}:${mark.on ? 1 : 0}`).sort();
  return `${selection.all ? 'all' : 'some'}|${marks.join(',')}`;
}

function subfolderIncluded(selection, folderId, inherited) {
  const mark = selection.marks.get(folderId);
  return mark ? mark.on : inherited;
}

function subfolderLeadsToSelection(selection, folderId) {
  for (const mark of selection.marks.values()) if (mark.on && mark.path.includes(folderId)) return true;
  return false;
}

// Visits the root and every folder the selection needs, breadth first.
function walkSubfolderSelection(cache, rootIds, selection, visit) {
  const queue = [...rootIds].map((id) => ({ id, included: true, childDefault: selection.all, root: true }));
  const seen = new Set();
  while (queue.length) {
    const entry = queue.shift();
    if (seen.has(entry.id)) continue;
    seen.add(entry.id);
    visit(entry);
    (cache.foldersByParent.get(entry.id) || []).forEach((folder) => {
      const on = subfolderIncluded(selection, folder.id, entry.childDefault);
      if (on || subfolderLeadsToSelection(selection, folder.id)) queue.push({ id: folder.id, included: on, childDefault: on, root: false });
    });
  }
}

function currentRootIds(folderId = state.currentFolderId) {
  const rootIds = new Set([folderId === 'root' ? (state.rootFolderId || 'root') : folderId]);
  if (folderId === 'root') rootIds.add('root');
  return rootIds;
}

// An included folder needs its whole listing; one the selection only passes
// through needs just its subfolders.
function treeCacheCoversSelection(cache, folderId = state.currentFolderId, selection = subfolderSelectionFor(folderId)) {
  if (!treeCacheCoversFolder(cache, folderId)) return false;
  if (!cache.scannedFolderIds || !selection) return true;
  let covered = true;
  walkSubfolderSelection(cache, currentRootIds(folderId), selection, ({ id, root, included }) => {
    if (!root && !cache.scannedFolderIds.has(id) && (included || !cache.childListedIds?.has(id))) covered = false;
  });
  return covered;
}

async function applyFolderView() {
  if (state.deepScan && !subfolderSelectionFor()) {
    state.deepScan = false;
    syncDeepScanToggle();
  }
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
  if (showCachedFolderListing()) return;
  const generation = state.listGeneration + 1;
  const loaded = await loadFiles({ append: false });
  if (!loaded || generation !== state.listGeneration || state.sort !== 'random') return;
  await shuffleWholeFolder(generation);
}

// Random order needs the whole folder; a newer listing, sort or filter wins.
async function shuffleWholeFolder(generation) {
  const filterAtStart = state.filter;
  const statusToken = beginLibraryStatus('대상 폴더의 전체 미디어를 모아 무작위로 섞는 중…', { progress: true });
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

// A folder read completely before (by a scan or an ordinary listing) opens
// from the cache without asking Drive again.
function showCachedFolderListing(folderId = state.currentFolderId) {
  const cache = state.treeCache;
  if (state.demo || !cache?.scannedFolderIds || !treeCacheCoversFolder(cache, folderId)) return false;
  if (folderId === 'root' && (!state.rootFolderId || state.rootFolderId === 'root')) return false;
  const rootIds = currentRootIds(folderId);
  const media = dedupeFiles([...rootIds].flatMap((id) => cache.mediaByParent.get(id) || [])).filter(isSupportedMediaFile);
  media.forEach((file) => { file.__origin = ''; });
  const current = cache.foldersById.get(folderId);
  if (current?.name && folderId !== 'root') state.currentFolderName = current.name;
  state.folders = dedupeFiles([...rootIds].flatMap((id) => cache.foldersByParent.get(id) || []));
  state.files = media;
  state.nextPageToken = null;
  state.populationComplete = true;
  showLibrary();
  renderFiles({ resetWindow: true });
  updateLibrarySummary();
  return true;
}

// Every complete ordinary listing joins the cache, so returning to the folder,
// including its subfolders or opening it from a scan never lists it again.
function rememberCompleteFolderListing(folderId = state.currentFolderId) {
  const previous = state.treeCache;
  if (state.demo || !state.populationComplete || (previous && !previous.scannedFolderIds)) return;
  const id = folderId === 'root' ? state.rootFolderId : folderId;
  if (!id || id === 'root') return;
  const items = [...state.folders, ...state.files];
  if (items.some((item) => item.parents?.[0] !== id)) return;
  const scanned = new Set([...(previous?.scannedFolderIds || []), id]);
  if (folderId === 'root') scanned.add('root');
  const retained = (previous?.items || []).filter((item) => item.parents?.[0] !== id);
  state.treeCache = buildTreeIndexes(dedupeFiles([...retained, ...items]), scanned, previous?.childListedIds);
}

function treeCacheCoversFolder(cache, folderId = state.currentFolderId) {
  return Boolean(cache && (!cache.scannedFolderIds || cache.scannedFolderIds.has(folderId)
    || (folderId === 'root' && cache.scannedFolderIds.has(state.rootFolderId))));
}

async function ensureTreeCache(folderId = state.currentFolderId) {
  const selectionKey = subfolderSelectionKey(subfolderSelectionFor(folderId));
  if (state.treeCachePromise && (state.treeCachePromise.folderId !== folderId
    || state.treeCachePromise.selectionKey !== selectionKey || state.treeAbort?.signal.aborted)) {
    state.treeAbort?.abort();
    await state.treeCachePromise;
    if (folderId !== state.currentFolderId) return;
    return ensureTreeCache(folderId);
  }
  if (treeCacheCoversSelection(state.treeCache, folderId)) return state.treeCache;
  if (state.treeCachePromise) return state.treeCachePromise;
  const promise = collectTreeCache(folderId);
  promise.folderId = folderId;
  promise.selectionKey = selectionKey;
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
  const selection = subfolderSelectionFor(folderId) || { rootId: folderId, all: true, marks: new Map() };
  const selectionKey = subfolderSelectionKey(selection);
  const ownsView = () => ownsAccount() && folderId === state.currentFolderId && listingGeneration === state.listGeneration
    && (!state.deepScan || selectionKey === subfolderSelectionKey(subfolderSelectionFor(folderId)));
  const assertCurrent = () => {
    if (controller.signal.aborted || !ownsAccount()) throw new DOMException('Folder scan cancelled', 'AbortError');
  };
  const scopeName = state.currentFolderName || '현재 폴더';
  if (el.deepScanToggle) el.deepScanToggle.disabled = true;
  if (el.deepScanStopBtn) {
    el.deepScanStopBtn.hidden = false;
    el.deepScanStopBtn.setAttribute('aria-label', `${scopeName} 하위 폴더 탐색 중지`);
  }
  const statusToken = beginLibraryStatus(`${scopeName} 및 하위 폴더를 탐색하는 중…`, { progress: true });
  try {
    // A folder already read (by an earlier scan or a complete ordinary listing)
    // is never read again; Refresh is what drops the cache.
    const previous = state.treeCache;
    const scannedBefore = (id) => Boolean(previous && (!previous.scannedFolderIds || previous.scannedFolderIds.has(id)));
    const knownFolder = folderId === 'root'
      ? (state.rootFolderId && state.rootFolderId !== 'root' ? previous?.foldersById.get(state.rootFolderId) : null)
      : knownFolderRecord(folderId);
    // The pages an ordinary listing of this folder already loaded are kept and
    // its listing continues from the next page instead of starting over.
    const seed = deepScanListingSeed?.folderId === folderId && deepScanListingSeed.generation === listingGeneration
      ? deepScanListingSeed : null;
    deepScanListingSeed = null;
    let root = knownFolder?.id && knownFolder.mimeType === FOLDER_MIME ? knownFolder : null;
    // Items listed with this folder as their parent already prove it is one.
    if (!root && seed?.items.length && folderId !== 'root') {
      root = { id: folderId, name: state.currentFolderName, mimeType: FOLDER_MIME, parents: [],
        driveId: seed.items.find((item) => item.driveId)?.driveId };
    }
    if (!root) {
      const resourceKeys = buildResourceKeysHeader([knownFolder]);
      const rootParams = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name,mimeType,parents,driveId,resourceKey' });
      const rootResponse = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?${rootParams}`, {
        signal: controller.signal, headers: resourceKeys ? { 'X-Goog-Drive-Resource-Keys': resourceKeys } : {}
      });
      root = await rootResponse.json();
      assertCurrent();
    }
    if (!root?.id || root.mimeType !== FOLDER_MIME || (folderId !== 'root' && root.id !== folderId)) {
      throw new Error('탐색할 폴더 정보를 확인하지 못했습니다.');
    }
    if (folderId === 'root') state.rootFolderId = root.id;
    // A Drive root has no parent; keep its metadata outside the visible root
    // children rather than interpreting the missing parent as the 'root' alias.
    const items = [{ ...root, parents: root.parents?.length ? root.parents : ['__drive_tree_boundary__'] }];
    let listedItems = 0, listedFolders = 0;
    // Listings put folders first, so once a media file has arrived every
    // subfolder is known and can be listed while later pages still load.
    const listFolder = async (folder, onSubfolders) => {
      const seeded = folder.id === root.id ? seed : null;
      const files = seeded ? [...seeded.items] : [];
      const announce = () => { if (files.some(item => item.mimeType !== FOLDER_MIME)) onSubfolders(files.filter(item => item.mimeType === FOLDER_MIME)); };
      let pageToken = seeded ? seeded.nextPageToken : null;
      const seenPageTokens = new Set();
      if (seeded) announce();
      while (!seeded || pageToken) {
        assertCurrent();
        // A continuation repeats the query its page token came from.
        const params = seeded ? folderListingParams(folderId, { listedParent: seeded.listedParent }) : folderListingParams(folder.id);
        if (!seeded) {
          params.set('corpora', folder.driveId || root.driveId ? 'drive' : 'user');
          if (folder.driveId || root.driveId) params.set('driveId', folder.driveId || root.driveId);
        }
        if (pageToken) params.set('pageToken', pageToken);
        const keys = buildResourceKeysHeader([folder]);
        const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, {
          signal: controller.signal, headers: keys ? { 'X-Goog-Drive-Resource-Keys': keys } : {}
        });
        const data = await response.json();
        assertCurrent();
        if (seeded?.listedParent && Array.isArray(data.files)) data.files.forEach((item) => {
          if (item && typeof item === 'object' && !Array.isArray(item.parents)) item.parents = [folder.id];
        });
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
        if (pageToken) announce();
        listedItems += data.files.length;
        updateLibraryStatus(statusToken, `${scopeName} 및 하위 폴더 탐색 중… ${listedItems.toLocaleString('ko-KR')}개 항목 · ${listedFolders.toLocaleString('ko-KR')}개 폴더 확인`, { progress: true });
        if (!pageToken) break;
      }
      listedFolders += 1;
      return files;
    };
    // A pool lists each subfolder as soon as its parent's listing arrives
    // instead of waiting for a whole depth to finish. A folder the selection
    // only passes through needs just its subfolders, which the picker usually
    // knows already. Items are assembled breadth first afterwards, so the
    // result never depends on which response came first.
    const listings = new Map(), childLists = new Map(), visitedIncluded = new Set(), visitedPassing = new Set();
    const childrenOf = (id) => listings.has(id) ? listings.get(id).filter(item => item.mimeType === FOLDER_MIME)
      : childLists.get(id) || previous?.foldersByParent.get(id) || [];
    const readFolder = async ({ folder, included }, onSubfolders) => {
      if (scannedBefore(folder.id) || listings.has(folder.id)) return;
      if (!included && (previous?.childListedIds?.has(folder.id) || childLists.has(folder.id))) return;
      const pickedChildren = !included && subfolderPicker.rootId === folderId ? subfolderPicker.children.get(folder.id) : null;
      if (pickedChildren) {
        childLists.set(folder.id, pickedChildren.map((child) => ({ ...child, parents: [folder.id] })));
        return;
      }
      listings.set(folder.id, await listFolder(folder, onSubfolders));
    };
    const queue = [{ folder: root, childDefault: selection.all, included: true }];
    await new Promise((resolve, reject) => {
      let active = 0, failed = false;
      const announced = new Map();
      const enqueueChildren = (entry, children) => {
        if (!announced.has(entry.folder.id)) announced.set(entry.folder.id, new Set());
        const seen = announced.get(entry.folder.id);
        children.forEach((child) => {
          if (seen.has(child.id)) return;
          seen.add(child.id);
          const on = subfolderIncluded(selection, child.id, entry.childDefault);
          if (on || subfolderLeadsToSelection(selection, child.id)) queue.push({ folder: child, childDefault: on, included: on });
        });
      };
      const pump = () => {
        while (!failed && active < DEEP_SCAN_CONCURRENCY && queue.length) {
          const entry = queue.shift();
          // A folder first passed through may later be reached as included.
          const visited = entry.included ? visitedIncluded : visitedPassing;
          if (visitedIncluded.has(entry.folder.id) || visited.has(entry.folder.id)) continue;
          visited.add(entry.folder.id);
          active += 1;
          readFolder(entry, (children) => { enqueueChildren(entry, children); pump(); }).then(() => {
            active -= 1;
            enqueueChildren(entry, childrenOf(entry.folder.id));
            pump();
          }, (error) => { failed = true; reject(error); });
        }
        if (!failed && !active && !queue.length) resolve();
      };
      pump();
    });
    assertCurrent();
    const placed = new Set([root.id]);
    for (const id of placed) {
      if (listings.has(id)) items.push(...listings.get(id));
      if (childLists.has(id)) items.push(...childLists.get(id));
      childrenOf(id).forEach((child) => {
        if (visitedIncluded.has(child.id) || visitedPassing.has(child.id)) placed.add(child.id);
      });
    }
    const scannedFolderIds = new Set([...placed].filter((id) => listings.has(id)));
    if (folderId === 'root') scannedFolderIds.add('root');
    const retained = (previous?.items || []).filter(item => item.id !== root.id && !scannedFolderIds.has(item.parents?.[0])
      && !(item.mimeType === FOLDER_MIME && childLists.has(item.parents?.[0])));
    const coverage = previous && !previous.scannedFolderIds ? null : new Set([...(previous?.scannedFolderIds || []), ...scannedFolderIds]);
    const childListedIds = new Set([...(previous?.childListedIds || []), ...childLists.keys()]);
    state.treeCache = buildTreeIndexes(dedupeFiles([...retained, ...items]), coverage, childListedIds);
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
    updateLibraryStatus(statusToken, `하위 폴더를 불러오지 못했습니다: ${humanizeDriveError(error)}`);
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

function buildTreeIndexes(items, scannedFolderIds = null, childListedIds = null) {
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
  return { items, foldersById, foldersByParent, mediaByParent, scannedFolderIds, childListedIds: childListedIds || new Set() };
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
  if (!treeCacheCoversSelection(cache)) return;
  // 'root' 별칭과 실제 루트 폴더 ID 양쪽에서 직계 자식이 붙어 있을 수 있어 둘 다 탐색
  const rootIds = currentRootIds();
  const selection = subfolderSelectionFor() || { all: false, marks: new Map() };
  const media = [];
  let includedFolders = 0;
  walkSubfolderSelection(cache, rootIds, selection, ({ id, included, root }) => {
    if (!included) return;
    if (!root) includedFolders += 1;
    (cache.mediaByParent.get(id) || []).forEach((file) => media.push(file));
  });
  state.subfolderSummary = !state.deepScan ? ''
    : isWholeSubfolderSelection(state.subfolderSelection) ? '하위 폴더 전체 포함'
      : `하위 폴더 ${includedFolders.toLocaleString('ko-KR')}개 포함`;
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
  const statusToken = beginLibraryStatus('계정의 좋아요 항목을 모든 폴더에서 모으는 중…', { progress: true });
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

// Applies the picker's choice; nothing chosen turns subfolder inclusion off.
// Pages of the current folder's ordinary listing, handed to the next scan of
// that folder so it continues the listing rather than starting it again.
let deepScanListingSeed = null;

function applySubfolderSelection(selection) {
  if (state.loadingTree) state.treeAbort?.abort();
  const any = Boolean(selection) && (selection.all || [...selection.marks.values()].some((mark) => mark.on));
  const wasOn = state.deepScan;
  const seed = !wasOn && any && state.filter !== 'favorites' && !state.listLoadError
    && (state.files.length || state.folders.length || state.nextPageToken)
    ? { folderId: state.currentFolderId, items: [...state.folders, ...state.files], nextPageToken: state.nextPageToken,
      listedParent: state.currentFolderId !== 'root' } : null;
  state.deepScan = any;
  state.subfolderSelection = any ? cloneSubfolderSelection({ ...selection, rootId: state.currentFolderId }) : null;
  syncDeepScanToggle();
  resetListingSession();
  deepScanListingSeed = seed && { ...seed, generation: state.listGeneration };
  scrollToLibraryTop();
  animateFolderTransition(any || !wasOn ? 'forward' : 'back');
  applyFolderView();
}

function syncDeepScanToggle() {
  if (!el.deepScanToggle) return;
  el.deepScanToggle.setAttribute('aria-pressed', String(state.deepScan));
  el.deepScanToggle.classList.toggle('active', state.deepScan);
  const label = el.deepScanToggle.querySelector?.('.deep-scan-state');
  if (!label) return;
  const selection = state.deepScan ? state.subfolderSelection : null;
  const chosen = selection ? [...selection.marks.values()].filter((mark) => mark.on).length : 0;
  label.textContent = !state.deepScan ? '' : isWholeSubfolderSelection(selection) ? '전체'
    : selection.all ? '일부 제외' : `${chosen}개`;
}

// Subfolder picker (D119): a lazily expanded tree of the current folder's
// subfolders. Checking a folder covers everything under it; an expanded folder
// can still exclude or add deeper folders individually.
const subfolderPicker = { draft: null, rootId: null, children: new Map(), failed: new Set(), expanded: new Set(), abort: null };

function sortFoldersByName(folders) {
  return [...folders].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true }));
}

function knownChildFolders(folderId) {
  if (subfolderPicker.children.has(folderId)) return subfolderPicker.children.get(folderId);
  const isRoot = folderId === subfolderPicker.rootId;
  const ids = isRoot ? [...currentRootIds(folderId)] : [folderId];
  const cache = state.treeCache;
  if (cache && (!cache.scannedFolderIds || ids.some((id) => cache.scannedFolderIds.has(id) || cache.childListedIds?.has(id)))) {
    return sortFoldersByName(dedupeFiles(ids.flatMap((id) => cache.foldersByParent.get(id) || [])));
  }
  // Ordinary listings put folders first, so once a media file has arrived (or
  // the listing is complete) every subfolder of this folder is already known.
  if (isRoot && !state.deepScan && state.filter !== 'favorites' && !state.listLoadError
    && (state.populationComplete || state.files.length)) return sortFoldersByName(state.folders);
  return null;
}

function knownFolderRecord(folderId) {
  return state.treeCache?.foldersById?.get(folderId)
    || state.folders.find((folder) => folder.id === folderId)
    || state.folderIndex?.folders?.find((folder) => folder.id === folderId)
    || [...subfolderPicker.children.values()].flat().find((folder) => folder.id === folderId)
    || [...libraryNavigation.entries.values()].flatMap((entry) => entry.data?.folders || []).find((folder) => folder.id === folderId)
    || null;
}

async function fetchChildFolders(folderId, signal) {
  let folder = knownFolderRecord(folderId);
  if (!folder || (folderId === 'root' && !folder.id)) {
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: 'id,name,mimeType,driveId,resourceKey' });
    const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(folderId)}?${params}`, { signal });
    folder = await response.json();
  }
  const parentId = folderId === 'root' ? (folder.id || 'root') : folderId;
  const keys = buildResourceKeysHeader([folder]);
  const folders = [];
  const seenTokens = new Set();
  let pageToken = null;
  do {
    const params = new URLSearchParams({
      pageSize: '1000', orderBy: 'name', spaces: 'drive', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true',
      q: `trashed = false and '${parentId}' in parents and mimeType = '${FOLDER_MIME}'`,
      fields: 'nextPageToken,files(id,name,mimeType,parents,driveId,resourceKey)'
    });
    if (folder.driveId) { params.set('corpora', 'drive'); params.set('driveId', folder.driveId); }
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`${DRIVE_API}/files?${params}`, { signal, headers: keys ? { 'X-Goog-Drive-Resource-Keys': keys } : {} });
    const data = await response.json();
    if (!Array.isArray(data.files)) throw new Error('Google Drive가 올바른 폴더 목록을 반환하지 않았습니다.');
    folders.push(...data.files.filter((item) => item?.id && item.mimeType === FOLDER_MIME));
    pageToken = data.nextPageToken || null;
    if (pageToken && seenTokens.has(pageToken)) throw new Error('Drive가 같은 페이지 토큰을 반복했습니다.');
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);
  return sortFoldersByName(folders);
}

async function loadSubfolderChildren(folderId) {
  if (knownChildFolders(folderId) || state.demo) return;
  const controller = subfolderPicker.abort;
  subfolderPicker.failed.delete(folderId);
  try {
    const folders = await fetchChildFolders(folderId, controller?.signal);
    if (controller !== subfolderPicker.abort || controller?.signal.aborted) return;
    subfolderPicker.children.set(folderId, folders);
  } catch (error) {
    if (controller !== subfolderPicker.abort || controller?.signal.aborted || error?.name === 'AbortError') return;
    reportAppFailure('subfolder-picker', error, 'warn');
    subfolderPicker.failed.add(folderId);
  }
  renderSubfolderPicker();
}

function openSubfolderPicker() {
  if (!el.subfolderDialog || state.filter === 'favorites') return;
  if (el.libraryOptions) el.libraryOptions.open = false;
  subfolderPicker.abort?.abort();
  subfolderPicker.abort = new AbortController();
  subfolderPicker.rootId = state.currentFolderId;
  subfolderPicker.expanded = new Set();
  subfolderPicker.failed = new Set();
  const current = subfolderSelectionFor();
  subfolderPicker.draft = current ? cloneSubfolderSelection(current) : { rootId: state.currentFolderId, all: false, marks: new Map() };
  if (el.subfolderDialogText) el.subfolderDialogText.textContent = `${state.currentFolderName || '현재 폴더'}의 미디어와 함께 볼 하위 폴더를 고르세요.`;
  if (el.subfolderOffButton) el.subfolderOffButton.hidden = !state.deepScan;
  renderSubfolderPicker();
  if (!el.subfolderDialog.open) el.subfolderDialog.showModal();
  void loadSubfolderChildren(subfolderPicker.rootId);
}

function closeSubfolderPicker() {
  subfolderPicker.abort?.abort();
  subfolderPicker.abort = null;
  if (el.subfolderDialog?.open) el.subfolderDialog.close();
}

function setSubfolderMark(folderId, path, on, inherited) {
  const { marks } = subfolderPicker.draft;
  // A new choice covers the whole subtree, so deeper choices are dropped.
  for (const [id, mark] of [...marks]) if (mark.path.includes(folderId)) marks.delete(id);
  if (on === inherited) marks.delete(folderId);
  else marks.set(folderId, { on, path: [...path] });
}

function subfolderHasDifferentDescendant(folderId, on) {
  for (const mark of subfolderPicker.draft.marks.values()) if (mark.path.includes(folderId) && mark.on !== on) return true;
  return false;
}

function buildSubfolderRows(parentId, path, inherited, level) {
  const children = knownChildFolders(parentId);
  const message = (text, retry) => {
    const row = document.createElement('div');
    row.className = 'subfolder-message';
    row.style.setProperty('--level', String(level));
    row.textContent = text;
    if (retry) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'text-button';
      button.textContent = '다시 시도';
      button.addEventListener('click', () => { renderSubfolderPicker(); void loadSubfolderChildren(parentId); });
      row.append(button);
    }
    return row;
  };
  if (!children) {
    return [subfolderPicker.failed.has(parentId) ? message('폴더 목록을 불러오지 못했습니다.', true) : message('폴더 목록을 불러오는 중…')];
  }
  if (!children.length) return level === 1 ? [message('하위 폴더가 없습니다.')] : [];
  return children.flatMap((folder) => {
    const on = subfolderIncluded(subfolderPicker.draft, folder.id, inherited);
    const expanded = subfolderPicker.expanded.has(folder.id);
    const known = knownChildFolders(folder.id);
    const row = document.createElement('div');
    row.className = 'subfolder-row';
    row.setAttribute('role', 'treeitem');
    row.setAttribute('aria-level', String(level));
    row.setAttribute('aria-selected', String(on));
    if (!known || known.length) row.setAttribute('aria-expanded', String(expanded));
    row.style.setProperty('--level', String(level));
    const expand = document.createElement('button');
    expand.type = 'button';
    expand.className = 'subfolder-expand';
    expand.setAttribute('aria-label', `${folder.name || '폴더'} ${expanded ? '접기' : '펼치기'}`);
    expand.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>';
    // A leaf keeps the chevron's space so checkboxes stay aligned per level.
    if (known && !known.length) { expand.classList.add('is-leaf'); expand.tabIndex = -1; expand.setAttribute('aria-hidden', 'true'); }
    expand.addEventListener('click', () => {
      if (subfolderPicker.expanded.has(folder.id)) subfolderPicker.expanded.delete(folder.id);
      else subfolderPicker.expanded.add(folder.id);
      renderSubfolderPicker({ focusId: folder.id, focusExpand: true });
      void loadSubfolderChildren(folder.id);
    });
    const label = document.createElement('label');
    label.className = 'subfolder-check';
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.className = 'custom-checkbox';
    box.dataset.folderId = folder.id;
    box.checked = on;
    box.indeterminate = subfolderHasDifferentDescendant(folder.id, on);
    box.addEventListener('change', () => {
      setSubfolderMark(folder.id, path, box.checked, inherited);
      renderSubfolderPicker({ focusId: folder.id });
    });
    const name = document.createElement('span');
    name.textContent = folder.name || '이름 없는 폴더';
    label.append(box, name);
    row.append(expand, label);
    return expanded ? [row, ...buildSubfolderRows(folder.id, [...path, folder.id], on, level + 1)] : [row];
  });
}

function renderSubfolderPicker({ focusId = null, focusExpand = false } = {}) {
  const draft = subfolderPicker.draft;
  if (!draft || !el.subfolderTree) return;
  el.subfolderTree.replaceChildren(...buildSubfolderRows(subfolderPicker.rootId, [], draft.all, 1));
  const marks = [...draft.marks.values()];
  const anyOn = marks.some((mark) => mark.on);
  const anyOff = marks.some((mark) => !mark.on);
  if (el.subfolderAllCheckbox) {
    el.subfolderAllCheckbox.checked = draft.all && !anyOff;
    el.subfolderAllCheckbox.indeterminate = draft.all ? anyOff : anyOn;
  }
  if (el.subfolderApplyButton) el.subfolderApplyButton.textContent = draft.all || anyOn ? '적용' : '하위 폴더 없이 보기';
  if (focusId) {
    const box = [...(el.subfolderTree.querySelectorAll?.('input[data-folder-id]') || [])].find((node) => node.dataset.folderId === focusId);
    (focusExpand ? box?.closest('.subfolder-row')?.querySelector('.subfolder-expand') : box)?.focus();
  }
}

function setupSubfolderPicker() {
  el.deepScanToggle?.addEventListener('click', openSubfolderPicker);
  el.subfolderAllCheckbox?.addEventListener('change', () => {
    subfolderPicker.draft.all = el.subfolderAllCheckbox.checked;
    subfolderPicker.draft.marks.clear();
    renderSubfolderPicker();
  });
  el.subfolderApplyButton?.addEventListener('click', () => {
    const draft = cloneSubfolderSelection(subfolderPicker.draft);
    closeSubfolderPicker();
    applySubfolderSelection(draft);
  });
  el.subfolderOffButton?.addEventListener('click', () => {
    closeSubfolderPicker();
    applySubfolderSelection(null);
  });
  el.subfolderDialog?.addEventListener('close', () => {
    subfolderPicker.abort?.abort();
    subfolderPicker.abort = null;
  });
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

