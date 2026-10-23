'use strict';

// Thumbnail extraction queue, folder listing pages and folder navigation.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const generatedThumbnailCache = new Map();

function updateListLoadingUI() {
  const ordinaryView = state.filter !== 'favorites' && !state.deepScan;
  const collecting = ordinaryView && !state.listLoadError && (state.loadingFiles || Boolean(state.nextPageToken));
  if (ordinaryView && el.fileGrid) el.fileGrid.setAttribute('aria-busy', String(state.loadingFiles));
  if (el.infiniteScrollSpinner) el.infiniteScrollSpinner.hidden = !collecting;
  if (el.loadMoreButton) {
    el.loadMoreButton.hidden = !ordinaryView || !state.listLoadError;
    el.loadMoreButton.disabled = state.loadingFiles;
  }
}

// Collect metadata sequentially; scrolling only determines which cards are rendered.
function isVideoStartupPending() {
  return el.playerSheet?.hidden === false && el.mediaLoading?.hidden === false
    && isVideoPresentation();
}

function scheduleNextFilePage() {
  const generation = state.listGeneration;
  requestAnimationFrame(() => {
    if (generation !== state.listGeneration || state.loadingFiles || state.listRequestPromise
      || state.populationLoadPromise || state.listLoadError || !state.nextPageToken
      || state.demo || state.deepScan || state.filter === 'favorites' || el.libraryView?.hidden
      || isVideoStartupPending()) return;
    void loadFiles({ append: true });
  });
}

const thumbnailExtractionQueue = [];
let activeThumbnailExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const THUMBNAIL_CACHE_LIMIT = 240;
let thumbnailGeneration = 0;
const thumbnailWaitersByFile = new Map();
const activeThumbnailJobs = new Set();
const gifThumbnailQueue = [];
const activeGifThumbnailJobs = new Set();
let activeGifThumbnailLoads = 0;
let gifThumbnailObserver = null;
const gifThumbnailEntries = new Map();

function cacheGeneratedThumbnail(fileId, dataUrl) {
  generatedThumbnailCache.delete(fileId);
  generatedThumbnailCache.set(fileId, dataUrl);
  if (generatedThumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldest = generatedThumbnailCache.keys().next().value;
    generatedThumbnailCache.delete(oldest);
  }
}

function extractVideoFrameThumbnail(file, imgElement, visualContainer) {
  if (!file || !file.mimeType?.startsWith('video/')) return;
  const cached = generatedThumbnailCache.get(file.id);
  if (cached) {
    imgElement.src = cached;
    imgElement.classList.add('loaded');
    visualContainer.classList.add('has-thumbnail');
    return;
  }

  const waiter = { imgElement, visualContainer, generation: thumbnailGeneration };
  const existing = thumbnailWaitersByFile.get(file.id);
  if (existing) {
    existing.push(waiter);
    return;
  }
  thumbnailWaitersByFile.set(file.id, [waiter]);
  thumbnailExtractionQueue.push({ file, generation: thumbnailGeneration });
  processThumbnailQueue();
}

// Frame extraction loads original bytes, so it starts only for cards near the
// viewport instead of for every card in the render window.
let videoFrameThumbnailObserver = null;
const pendingVideoFrameThumbnails = new Map();

function requestVideoFrameThumbnail(file, imgElement, visualContainer) {
  if (generatedThumbnailCache.has(file.id) || typeof IntersectionObserver !== 'function') {
    extractVideoFrameThumbnail(file, imgElement, visualContainer);
    return;
  }
  videoFrameThumbnailObserver ||= new IntersectionObserver((observations) => {
    observations.forEach((observation) => {
      if (!observation.isIntersecting) return;
      const pending = pendingVideoFrameThumbnails.get(observation.target);
      releaseVideoFrameThumbnailRequest(observation.target);
      if (pending) extractVideoFrameThumbnail(pending.file, pending.imgElement, observation.target);
    });
  }, { rootMargin: '600px 0px' });
  pendingVideoFrameThumbnails.set(visualContainer, { file, imgElement });
  videoFrameThumbnailObserver.observe(visualContainer);
}

function releaseVideoFrameThumbnailRequest(visualContainer) {
  pendingVideoFrameThumbnails.delete(visualContainer);
  videoFrameThumbnailObserver?.unobserve(visualContainer);
}

function pruneVideoFrameThumbnailRequests() {
  pendingVideoFrameThumbnails.forEach((_, visualContainer) => {
    if (visualContainer?.isConnected === false) releaseVideoFrameThumbnailRequest(visualContainer);
  });
}

function processThumbnailQueue() {
  // Fill every free slot; resuming after player priority must not leave the
  // queue running at a concurrency of one.
  while (!playerMediaPriorityActive && activeThumbnailExtractions < MAX_CONCURRENT_EXTRACTIONS
    && thumbnailExtractionQueue.length) startNextThumbnailExtraction();
}

function startNextThumbnailExtraction() {

  const { file, generation } = thumbnailExtractionQueue.shift();
  const waiters = thumbnailWaitersByFile.get(file.id) || [];

  if (generation !== thumbnailGeneration) {
    thumbnailWaitersByFile.delete(file.id);
    setTimeout(processThumbnailQueue, 0);
    return;
  }

  const cached = generatedThumbnailCache.get(file.id);
  if (cached) {
    waiters.forEach(({ imgElement, visualContainer }) => {
      if (!imgElement.isConnected) return;
      imgElement.src = cached;
      imgElement.classList.add('loaded');
      visualContainer.classList.add('has-thumbnail');
    });
    thumbnailWaitersByFile.delete(file.id);
    processThumbnailQueue();
    return;
  }

  if (!waiters.some(({ imgElement }) => imgElement.isConnected)) {
    thumbnailWaitersByFile.delete(file.id);
    setTimeout(processThumbnailQueue, 0);
    return;
  }

  activeThumbnailExtractions++;
  waiters.forEach(({ visualContainer }) => visualContainer.classList.add('is-generating'));

  const mediaUrl = buildMediaUrl(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = mediaUrl;
  video.currentTime = 0.1;

  let isDone = false;
  let timeout = null;
  const job = { video, cancel: (defer = false) => finish(null, defer) };
  activeThumbnailJobs.add(job);
  const finish = (dataUrl = null, defer = false) => {
    if (isDone) return;
    isDone = true;
    clearTimeout(timeout);
    activeThumbnailJobs.delete(job);
    activeThumbnailExtractions--;
    const subscribers = thumbnailWaitersByFile.get(file.id) || [];
    if (!defer) thumbnailWaitersByFile.delete(file.id);
    subscribers.forEach(({ visualContainer }) => visualContainer.classList.remove('is-generating'));
    try {
      video.removeAttribute('src');
      video.load();
    } catch (_) {}
    if (defer) {
      if (!thumbnailExtractionQueue.some((entry) => entry.file?.id === file.id && entry.generation === generation)) {
        thumbnailExtractionQueue.unshift({ file, generation });
      }
      return;
    }
    if (dataUrl && generation === thumbnailGeneration) {
      cacheGeneratedThumbnail(file.id, dataUrl);
      subscribers.forEach(({ imgElement, visualContainer, generation: subscriberGeneration }) => {
        if (subscriberGeneration !== thumbnailGeneration || !imgElement.isConnected) return;
        imgElement.src = dataUrl;
        imgElement.classList.add('loaded');
        visualContainer.classList.add('has-thumbnail');
      });
    }
    setTimeout(processThumbnailQueue, 40);
  };

  // Capture only after the 0.1s seek has landed; a loadeddata frame at position 0 is often black.
  const capture = () => {
    if (video.currentTime < 0.05) return;
    try {
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 180;
      if (w > 0 && h > 0) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 360 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        finish(dataUrl);
        return;
      }
    } catch (err) {
      reportAppFailure('canvas-frame-capture', err, 'warn');
    }
    finish();
  };

  video.addEventListener('loadeddata', capture);
  video.addEventListener('seeked', capture);
  video.addEventListener('error', () => finish(), { once: true });
  timeout = setTimeout(() => finish(), 4000);
}

async function loadFiles({ append, statusToken = null }) {
  if (state.demo) {
    startDemoMode();
    return true;
  }
  if (append && state.listRequestPromise) return state.listRequestPromise;
  if (append && !state.nextPageToken) return state.populationComplete;
  if (!hasUsableToken()) {
    showReconnectState();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return false;
  }

  if (!append) resetListingSession();
  const generation = state.listGeneration;
  const controller = state.listAbortController;
  state.loadingFiles = true;
  state.listLoadError = false;
  showLibrary();
  const requestStatusToken = statusToken ?? beginLibraryStatus(
    append ? '' : 'Drive에서 폴더와 원본 파일 목록을 불러오는 중…'
  );
  el.refreshButton.disabled = true;
  updateListLoadingUI();
  if (append) updateLibrarySummary();
  else renderFiles({ resetWindow: true });

  // The 'root' alias is not the id Drive reports in parents, so root keeps the field.
  const listedFolderId = state.currentFolderId;
  const listedParent = listedFolderId !== 'root';
  const params = folderListingParams(listedFolderId, { listedParent });
  const requestedPageToken = append ? state.nextPageToken : null;
  if (requestedPageToken) params.set('pageToken', requestedPageToken);
  else params.set('pageSize', String(DRIVE_FIRST_PAGE_SIZE));

  const request = (async () => {
   try {
    const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal, priority: append ? 'low' : 'auto' });
    const data = await response.json();
    if (generation !== state.listGeneration || controller.signal.aborted) return false;
    if (!Array.isArray(data.files) || (data.nextPageToken != null && typeof data.nextPageToken !== 'string')) {
      throw new Error('Drive가 올바른 파일 목록을 반환하지 않았습니다.');
    }
    if (data.incompleteSearch) throw new Error('Drive 파일 검색 결과가 완전하지 않습니다.');
    const nextPageToken = data.nextPageToken || null;
    if (nextPageToken && (nextPageToken === requestedPageToken || state.listPageTokens.has(nextPageToken))) {
      throw new Error('Drive가 같은 페이지 토큰을 반복했습니다.');
    }
    const incoming = data.files;
    if (listedParent) incoming.forEach((item) => {
      if (item && typeof item === 'object' && !Array.isArray(item.parents)) item.parents = [listedFolderId];
    });
    const incomingFolders = incoming.filter((f) => f.mimeType === FOLDER_MIME);
    const incomingMedia = incoming.filter((f) => f.mimeType?.startsWith('video/') || f.mimeType?.startsWith('image/'));

    if (append) {
      state.files = dedupeFiles([...state.files, ...incomingMedia]);
      state.folders = dedupeFiles([...state.folders, ...incomingFolders]);
    } else {
      state.files = incomingMedia;
      state.folders = incomingFolders;
    }
    if (requestedPageToken) state.listPageTokens.add(requestedPageToken);
    state.nextPageToken = nextPageToken;
    state.populationComplete = !state.nextPageToken;
    renderFiles({ resetWindow: !append });
    updateLibraryStatus(requestStatusToken, '');
    return true;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.listGeneration) {
      return false;
    }
    reportAppFailure('library-list', error);
    state.listLoadError = true;
    updateLibraryStatus(requestStatusToken, `파일 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    if (error.status === 401) {
      clearRejectedToken(error);
      showReconnectState();
    }
    return false;
  } finally {
    if (generation === state.listGeneration) {
      state.loadingFiles = false;
      el.refreshButton.disabled = false;
      updateListLoadingUI();
      updateLibrarySummary();
      if (!state.listLoadError && !state.nextPageToken) renderFiles();
      updateConnectionBadge();
    }
  }
  })();
  state.listRequestPromise = request;
  try {
    return await request;
  } finally {
    if (state.listRequestPromise === request) {
      state.listRequestPromise = null;
      if (generation === state.listGeneration && !state.listLoadError) scheduleNextFilePage();
    }
  }
}

function resetListingSession() {
  clearLibraryStatus();
  state.listAbortController?.abort();
  state.listGeneration++;
  state.listAbortController = new AbortController();
  state.listRequestPromise = null;
  state.populationLoadPromise = null;
  state.populationComplete = false;
  state.loadingFiles = false;
  // The aborted page load's finally no longer owns the button after this bump.
  if (el.refreshButton) el.refreshButton.disabled = false;
  state.listLoadError = false;
  state.listPageTokens = new Set();
  state.files = [];
  state.folders = [];
  state.nextPageToken = null;
  updateListLoadingUI();
  state.renderWindowStart = 0;
  state.renderRowHeight = 250;
  state.folderRenderLimit = FOLDER_RENDER_MAX;
  shuffledOrderMap.clear();
  thumbnailGeneration++;
  gifThumbnailObserver?.disconnect();
  gifThumbnailObserver = null;
  videoFrameThumbnailObserver?.disconnect();
  videoFrameThumbnailObserver = null;
  pendingVideoFrameThumbnails.clear();
  gifThumbnailEntries.forEach((entry) => releaseStaticGifThumbnail(entry, { dispose: true }));
  gifThumbnailEntries.clear();
  [...activeThumbnailJobs].forEach((job) => job.cancel());
  [...activeGifThumbnailJobs].forEach((job) => job.cancel());
  thumbnailWaitersByFile.clear();
  thumbnailExtractionQueue.splice(0);
  gifThumbnailQueue.splice(0);
  if (state.selectionMode || state.selectedFileIds.size) exitSelectionMode();
}

function navigateToFolder(folderId, folderName) {
  if (!folderId || state.bulkAction) return;
  if (folderId === state.currentFolderId) return;
  beginLibraryNavigation();
  // The breadcrumb always renders root as the first crumb; keep it out of the stack.
  if (state.currentFolderId !== 'root') {
    state.folderStack.push({ id: state.currentFolderId, name: state.currentFolderName });
  }
  enterFolder(folderId, folderName || '폴더', 'forward');
}

// Shared tail of every folder move after the folder stack is updated.
function enterFolder(folderId, folderName, direction) {
  state.currentFolderId = folderId;
  state.currentFolderName = folderName;
  resetListingSession();
  scrollToLibraryTop();
  commitLibraryNavigation();
  animateFolderTransition(direction);
  applyFolderView();
}

function previousLibraryEntry() {
  return libraryNavigation.entries.get(libraryNavigation.order[libraryNavigation.cursor - 1]);
}

// Reuse the owned history entry when the destination is exactly one step back.
function completeLibraryBackTo(folderId) {
  if (!hasOwnedLibraryBackEntry() || previousLibraryEntry()?.view.currentFolderId !== folderId) return false;
  completeLibraryBackNavigation();
  return true;
}

function buildBreadcrumbItems(folderStack, currentFolderId, currentFolderName) {
  const root = { id: 'root', name: '내 드라이브' };
  const currentId = currentFolderId || 'root';
  const seen = new Set([root.id, currentId]);
  const trail = [];
  (Array.isArray(folderStack) ? folderStack : []).forEach((crumb) => {
    if (!crumb?.id || seen.has(crumb.id)) return;
    seen.add(crumb.id);
    trail.push({ id: crumb.id, name: crumb.name || '폴더' });
  });
  if (currentId === 'root') return [root];
  return [root, ...trail, { id: currentId, name: currentFolderName || '폴더' }];
}

function navigateToFolderIndex(index) {
  const crumbs = buildBreadcrumbItems(state.folderStack, state.currentFolderId, state.currentFolderName);
  const target = crumbs[index];
  if (!target || target.id === state.currentFolderId) return;
  if (state.bulkAction || completeLibraryBackTo(target.id)) return;
  beginLibraryNavigation();
  state.folderStack = crumbs.slice(1, index);
  enterFolder(target.id, target.name, 'back');
}

function navigateToParentFolder() {
  if (state.bulkAction) return;
  if (!state.folderStack.length && state.currentFolderId === 'root') return;
  if (completeLibraryBackTo(state.folderStack.at(-1)?.id || 'root')) return;
  beginLibraryNavigation();
  const parent = state.folderStack.length
    ? state.folderStack.pop()
    : { id: 'root', name: '내 드라이브' };
  enterFolder(parent.id, parent.name, 'back');
}

