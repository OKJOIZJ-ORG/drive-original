'use strict';

// Media grid rendering, file cards, selection and library summary.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

async function fetchOriginalFileResponse(file, options = {}) {
  const { requireRevisionPin = false, ...fetchOptions } = options;
  let target = buildDriveMediaApiUrl(file);
  if (requireRevisionPin) {
    const context = { fileId: file.id, accountKey: state.authAccountKey, accountGeneration: state.driveSessionGeneration };
    if (!q0PinnedSource) throw DriveRevisionPin.error('PIN_UNAVAILABLE', 422);
    const pin = DriveRevisionPin.validatePin(q0PinnedSource, context);
    target = pin.uri;
    const headers = new Headers(fetchOptions.headers);
    if (pin.descriptor.resourceKey) {
      headers.set('X-Goog-Drive-Resource-Keys', `${file.id}/${pin.descriptor.resourceKey}`);
    } else headers.delete('X-Goog-Drive-Resource-Keys');
    fetchOptions.headers = Object.fromEntries(headers.entries());
  }
  return driveFetch(target, {
    ...fetchOptions,
    ...(requireRevisionPin ? { redirect: 'error', cache: 'no-store' } : {}),
    driveMaxRateAttempts: 1
  });
}

let renderWindowRaf = 0;

function getGridColumnCount() {
  if (!el.fileGrid) return 1;
  if (typeof getComputedStyle === 'function') {
    const tracks = getComputedStyle(el.fileGrid).gridTemplateColumns.split(/\s+/).filter((track) => /px$/.test(track));
    if (tracks.length) return tracks.length;
  }
  const width = el.fileGrid.clientWidth || Math.min(window.innerWidth || 360, 1140);
  const gap = 12;
  return Math.max(1, Math.floor((width + gap) / (160 + gap)));
}

function scheduleRenderWindowUpdate() {
  if (renderWindowRaf || !el.fileGrid || el.fileGrid.hidden) return;
  renderWindowRaf = requestAnimationFrame(() => {
    renderWindowRaf = 0;
    const files = filteredAndSortedFiles();
    if (files.length <= RENDER_WINDOW_MAX) return;
    const gridTop = el.fileGrid.getBoundingClientRect().top + window.scrollY;
    const relativeY = Math.max(0, window.scrollY + window.innerHeight / 2 - gridTop);
    const columns = getGridColumnCount();
    const focusRow = Math.floor(relativeY / Math.max(1, state.renderRowHeight));
    const currentWindow = computeRenderWindow(files.length, state.renderWindowStart, columns);
    const threshold = Math.max(columns, Math.floor((currentWindow.end - currentWindow.start) * RENDER_WINDOW_STEP_RATIO / columns) * columns);
    const rowHeight = Math.max(1, state.renderRowHeight);
    const totalRows = Math.ceil(files.length / columns);
    const viewportTop = window.scrollY || 0;
    const viewportBottom = viewportTop + (window.innerHeight || 0);
    const viewportIntersectsGrid = viewportBottom > gridTop && viewportTop < gridTop + totalRows * rowHeight;
    const viewportStartRow = Math.max(0, Math.floor((viewportTop - gridTop) / rowHeight));
    const viewportEndRow = Math.min(totalRows, Math.ceil((viewportBottom - gridTop) / rowHeight));
    const currentStartRow = Math.floor(currentWindow.start / columns);
    const currentEndRow = Math.ceil(currentWindow.end / columns);
    const viewportOutsideWindow = viewportIntersectsGrid
      && (viewportStartRow < currentStartRow || viewportEndRow > currentEndRow);
    let requestedStart = Math.max(0, (focusRow - 4) * columns);
    if (viewportIntersectsGrid && viewportStartRow < currentStartRow) {
      requestedStart = viewportStartRow * columns;
    } else if (viewportIntersectsGrid && viewportEndRow > currentEndRow) {
      const windowRows = Math.floor(RENDER_WINDOW_MAX / columns);
      requestedStart = Math.max(0, (viewportEndRow - windowRows) * columns);
    }
    const nextWindow = computeRenderWindow(files.length, requestedStart, columns);
    if (columns !== state.renderColumnCount || viewportOutsideWindow
      || Math.abs(nextWindow.start - state.renderWindowStart) >= threshold) {
      state.renderWindowStart = nextWindow.start;
      renderMediaGrid(files);
    }
  });
}

// Cards from the previous grid render, keyed by file id. A card is reused only
// for the same file object and the same per-card inputs, so moving the render
// window or re-rendering an unchanged range does not rebuild every card
// (thumbnails would re-decode and GIF canvases would be redrawn).
let renderedFileCards = new Map();

function fileCardSignature(file) {
  return [state.selectionMode, state.selectedFileIds.has(file.id), isFavoriteFileId(file.id),
    file.name, file.size, file.__origin, file.thumbnailLink, file.capabilities?.canDownload].join('\u0000');
}

function renderMediaGrid(files) {
  if (!el.fileGrid) return;
  const columns = getGridColumnCount();
  state.renderColumnCount = columns;
  const windowRange = computeRenderWindow(files.length, state.renderWindowStart, columns);
  state.renderWindowStart = windowRange.start;
  const topRows = Math.floor(windowRange.start / columns);
  const bottomRows = Math.ceil(Math.max(0, files.length - windowRange.end) / columns);
  const deferLimit = isMobileDevice() ? 16 : 24;
  const previousCards = renderedFileCards;
  const nextCards = new Map();
  const cards = files.slice(windowRange.start, windowRange.end).map((file, index) => {
    const signature = fileCardSignature(file);
    const previous = previousCards.get(file.id);
    if (previous && previous.file === file && previous.signature === signature && !nextCards.has(file.id)) {
      previous.card.classList?.toggle?.('defer-render', index >= deferLimit);
      nextCards.set(file.id, previous);
      return previous.card;
    }
    const card = createFileCard(file, index, windowRange.start + index);
    if (!nextCards.has(file.id)) nextCards.set(file.id, { file, signature, card });
    return card;
  });
  renderedFileCards = nextCards;
  el.fileGrid.style.paddingTop = `${topRows * state.renderRowHeight}px`;
  el.fileGrid.style.paddingBottom = `${bottomRows * state.renderRowHeight}px`;
  const mounted = el.fileGrid.children;
  const unchanged = mounted?.length === cards.length && cards.every((card, index) => mounted[index] === card);
  if (!unchanged) {
    const fragment = document.createDocumentFragment();
    cards.forEach((card) => fragment.appendChild(card));
    el.fileGrid.replaceChildren(fragment);
  }
  pruneStaticGifThumbnailEntries();
  pruneVideoFrameThumbnailRequests();
  const firstCard = el.fileGrid.querySelector('.file-card');
  const gap = typeof getComputedStyle === 'function' ? parseFloat(getComputedStyle(el.fileGrid).rowGap) || 0 : 12;
  const measuredHeight = firstCard?.getBoundingClientRect?.().height || firstCard?.offsetHeight || 0;
  if (measuredHeight && Math.abs((measuredHeight + gap) - state.renderRowHeight) >= .1) {
    state.renderRowHeight = measuredHeight + gap;
    el.fileGrid.style.paddingTop = `${topRows * state.renderRowHeight}px`;
    el.fileGrid.style.paddingBottom = `${bottomRows * state.renderRowHeight}px`;
  }
}

function renderFiles({ resetWindow = false } = {}) {
  const files = filteredAndSortedFiles();
  const loadingFavoriteView = state.filter === 'favorites' && state.loadingFavorites;
  if (resetWindow) state.renderWindowStart = 0;
  const visibleFolders = state.filter === 'all'
    ? state.folders.filter(matchesLibraryQuery)
    : [];
  // Folders live in a compact navigation strip, clearly separated from media thumbnails.
  if (el.folderStrip) {
    el.folderStrip.replaceChildren();
    if (visibleFolders.length) {
      const folderFragment = document.createDocumentFragment();
      visibleFolders.slice(0, state.folderRenderLimit).forEach((folder, index) => folderFragment.appendChild(createFolderRow(folder, index)));
      el.folderStrip.appendChild(folderFragment);
      el.folderStrip.hidden = false;
    } else {
      el.folderStrip.hidden = true;
    }
  }
  if (el.folderMoreButton) {
    const remaining = Math.max(0, visibleFolders.length - state.folderRenderLimit);
    el.folderMoreButton.hidden = remaining === 0;
    el.folderMoreButton.textContent = remaining
      ? `폴더 ${Math.min(FOLDER_RENDER_MAX, remaining).toLocaleString('ko-KR')}개 더 보기`
      : '폴더 더 보기';
  }
  renderMediaGrid(files);
  const collecting = state.filter !== 'favorites' && !state.deepScan && !state.listLoadError
    && (state.loadingFiles || Boolean(state.nextPageToken));
  if (el.fileGrid) el.fileGrid.setAttribute('aria-busy', String(loadingFavoriteView || state.loadingFiles));
  el.emptyState.hidden = loadingFavoriteView || collecting || files.length + visibleFolders.length > 0;
  if (!el.emptyState.hidden && el.emptyStateTitle && el.emptyStateText) {
    if (state.filter === 'favorites' && !state.query) {
      el.emptyStateTitle.textContent = '좋아요가 아직 없습니다';
      el.emptyStateText.textContent = '미디어를 두 번 탭하거나 하트 버튼을 눌러 이곳에 모아보세요.';
    } else if (state.query) {
      el.emptyStateTitle.textContent = '검색 결과가 없습니다';
      el.emptyStateText.textContent = `“${state.query}”와 일치하는 미디어나 폴더를 찾지 못했습니다.`;
    } else if (state.filter !== 'all') {
      const label = state.filter === 'video' ? '영상' : '이미지';
      el.emptyStateTitle.textContent = `${label}이 없습니다`;
      el.emptyStateText.textContent = `이 폴더에는 표시할 ${label}이 없습니다. 전체 필터에서 다른 항목을 확인해 보세요.`;
    } else {
      el.emptyStateTitle.textContent = '이 폴더가 비어 있습니다';
      el.emptyStateText.textContent = '이 폴더에는 표시할 수 있는 영상이나 이미지가 없습니다.';
    }
  }
  renderBreadcrumb();
  updateLibrarySummary(files.length, visibleFolders.length);
  scheduleNextFilePage();
}

function createFolderRow(folder, index = 0) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'folder-row';
  button.style.setProperty('--stagger', `${Math.min(index, 12) * 25}ms`);
  button.title = '폴더 열기';

  const glyph = document.createElement('span');
  glyph.className = 'folder-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name || '이름 없는 폴더';

  const chevron = document.createElement('span');
  chevron.className = 'folder-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  button.append(glyph, name, chevron);
  button.addEventListener('click', () => navigateToFolder(folder.id, folder.name));
  return button;
}

function shuffleCurrentFiles() {
  shuffledOrderMap = new Map();
  const shuffled = [...currentPopulationFiles()];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((file, index) => {
    shuffledOrderMap.set(file.id, index);
  });
}

/* 순차 수집 중인 목록의 남은 페이지를 같은 요청 체인으로 기다린다.
   랜덤 배열·랜덤 쇼츠가 '대상 폴더(또는 딥스캔 서브트리)의 전체 파일'을
   대상으로 동작하도록 보장한다. 진행 중 로드가 있으면 끝날 때까지 대기 후 이어 받는다. */
async function ensureAllPagesLoaded({ statusToken = state.libraryStatusToken } = {}) {
  if (state.filter === 'favorites') {
    if (state.loadingFavorites && state.favoriteLoadPromise) await state.favoriteLoadPromise;
    return;
  }
  if (state.demo || state.deepScan || state.populationComplete) return;
  if (state.populationLoadPromise) return state.populationLoadPromise;
  const generation = state.listGeneration;
  const seenTokens = new Set();
  const promise = (async () => {
    if (state.listRequestPromise) {
      const loaded = await state.listRequestPromise;
      if (!loaded && generation === state.listGeneration) {
        throw new Error('Drive 파일의 첫 페이지를 불러오지 못했습니다.');
      }
    }
    while (state.nextPageToken) {
      if (generation !== state.listGeneration) throw new DOMException('Collection aborted', 'AbortError');
      const token = state.nextPageToken;
      if (seenTokens.has(token)) throw new Error('Drive가 같은 페이지 토큰을 반복했습니다.');
      seenTokens.add(token);
      const loaded = await loadFiles({ append: true, statusToken });
      if (!loaded) {
        if (generation !== state.listGeneration) throw new DOMException('Collection aborted', 'AbortError');
        throw new Error('Drive 파일 페이지를 끝까지 불러오지 못했습니다.');
      }
      updateLibraryStatus(statusToken, `대상 폴더 전체 미디어 수집 중… ${state.files.length.toLocaleString('ko-KR')}개`);
    }
    if (generation !== state.listGeneration) throw new DOMException('Collection aborted', 'AbortError');
    state.populationComplete = true;
    updateLibraryStatus(statusToken, '');
  })();
  state.populationLoadPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.populationLoadPromise === promise) state.populationLoadPromise = null;
  }
}

// Search lowers each name once per name value instead of on every keystroke.
const lowerCaseItemNames = new WeakMap();
function matchesLibraryQuery(item) {
  if (!state.query) return true;
  const name = String(item.name || '');
  let cached = lowerCaseItemNames.get(item);
  if (cached?.name !== name) {
    cached = { name, lower: name.toLocaleLowerCase('ko') };
    lowerCaseItemNames.set(item, cached);
  }
  return cached.lower.includes(state.query);
}

function filteredAndSortedFiles() {
  const source = sortedPopulationFiles();
  const hidden = state.hiddenActionFileIds;
  if (filteredPopulationCache?.source === source && filteredPopulationCache.query === state.query
    && filteredPopulationCache.filter === state.filter && filteredPopulationCache.hidden === hidden) return filteredPopulationCache.files;
  const files = source.filter((file) => {
    if (hidden.has(file.id)) return false;
    const isVideo = file.mimeType?.startsWith('video/');
    const typeMatch = state.filter === 'all' || state.filter === 'favorites'
      || (state.filter === 'video' && isVideo) || (state.filter === 'image' && !isVideo);
    const queryMatch = matchesLibraryQuery(file);
    return typeMatch && queryMatch;
  });
  filteredPopulationCache = { source, query: state.query, filter: state.filter, hidden, files };
  return files;
}

function currentPopulationFiles() {
  return state.filter === 'favorites' ? state.favoriteFiles : state.files;
}

function sortedPopulationFiles() {
  const population = currentPopulationFiles();
  // Scroll-window renders reuse unchanged ordering instead of sorting the
  // complete library again. Replacements, growth and explicit shuffles reset it.
  if (sortedPopulationCache?.source === population && sortedPopulationCache.length === population.length
    && sortedPopulationCache.sort === state.sort
    && (state.sort !== 'random' || (sortedPopulationCache.order === shuffledOrderMap
      && sortedPopulationCache.orderSize === shuffledOrderMap.size))) return sortedPopulationCache.files;
  const remember = (files) => {
    sortedPopulationCache = { source: population, length: population.length, sort: state.sort,
      order: shuffledOrderMap, orderSize: shuffledOrderMap.size, files };
    return files;
  };
  const files = [...population];
  if (state.sort === 'random') {
    if (shuffledOrderMap.size !== population.length || population.some((file) => !shuffledOrderMap.has(file.id))) {
      shuffleCurrentFiles();
    }
    return remember(files.sort((a, b) => {
      const idxA = shuffledOrderMap.get(a.id) ?? 0;
      const idxB = shuffledOrderMap.get(b.id) ?? 0;
      return idxA - idxB;
    }));
  }

  if (state.sort === 'name') return remember(files.sort((a, b) => FILE_NAME_COLLATOR.compare(String(a.name), String(b.name))));
  if (state.sort === 'nameDesc') return remember(files.sort((a, b) => FILE_NAME_COLLATOR.compare(String(b.name), String(a.name))));
  const [key, ascending] = LIBRARY_SORT_KEYS[state.sort] || LIBRARY_SORT_KEYS.modifiedTime;
  // Compute each key once instead of twice per comparison. Files without the
  // value (an image's duration, say) stay after those that have it.
  const values = new Map(files.map((file) => [file, key(file)]));
  return remember(files.sort((a, b) => {
    const x = values.get(a); const y = values.get(b);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Number(Number.isFinite(y)) - Number(Number.isFinite(x));
    return ascending ? x - y : y - x;
  }));
}

const fileTimeSortKey = (field) => (file) => (file[field] ? new Date(file[field]).getTime() : NaN);
const LIBRARY_SORT_KEYS = Object.freeze({
  modifiedTime: [fileTimeSortKey('modifiedTime'), false],
  modifiedTimeAsc: [fileTimeSortKey('modifiedTime'), true],
  createdTime: [fileTimeSortKey('createdTime'), false],
  createdTimeAsc: [fileTimeSortKey('createdTime'), true],
  size: [(file) => (file.size == null ? NaN : Number(file.size)), false],
  sizeAsc: [(file) => (file.size == null ? NaN : Number(file.size)), true],
  duration: [(file) => (file.videoMediaMetadata?.durationMillis == null ? NaN : Number(file.videoMediaMetadata.durationMillis)), false]
});

function getSelectedFiles() {
  return currentPopulationFiles().filter((file) => state.selectedFileIds.has(file.id));
}

function getActionFiles() {
  if (state.accountIdentityPending && !state.demo) return [];
  const selectedFiles = getSelectedFiles();
  if (state.selectionMode) return selectedFiles;
  return state.selected ? [state.selected] : [];
}

function enterSelectionMode(initialFile = null) {
  if (!state.selectionMode) state.selectionGeneration += 1;
  state.selectionMode = true;
  if (initialFile?.id) state.selectedFileIds.add(initialFile.id);
  updateSelectionUI();
}

function exitSelectionMode() {
  const toolbarOwnedFocus = el.selectionToolbar?.contains(document.activeElement);
  state.selectionGeneration += 1;
  state.selectionMode = false;
  state.selectedFileIds.clear();
  state.pendingActionFiles = [];
  updateSelectionUI();
  if (toolbarOwnedFocus) el.selectionModeButton?.focus({ preventScroll: true });
}

function toggleFileSelection(file) {
  if (!file?.id) return;
  if (!state.selectionMode) state.selectionMode = true;
  if (state.selectedFileIds.has(file.id)) state.selectedFileIds.delete(file.id);
  else state.selectedFileIds.add(file.id);
  updateSelectionUI();
}

async function selectAllVisibleFiles() {
  if (!state.selectionMode) return;
  const context = [state.selectionGeneration, state.listGeneration, state.filter, state.query];
  const stillCurrent = () => state.selectionMode && context.every((value, index) =>
    value === [state.selectionGeneration, state.listGeneration, state.filter, state.query][index]);
  setButtonLoading(el.selectionSelectAllBtn, true, '전체 확인 중…');
  try {
    await ensureAllPagesLoaded();
    if (!stillCurrent()) return;
    filteredAndSortedFiles().forEach((file) => state.selectedFileIds.add(file.id));
    updateSelectionUI();
  } catch (error) {
    if (error?.name !== 'AbortError') showToast(`전체 항목을 선택하지 못했습니다: ${humanizeDriveError(error)}`);
  } finally {
    setButtonLoading(el.selectionSelectAllBtn, false);
  }
}

function updateSelectionUI() {
  const count = state.selectedFileIds.size;
  if (el.selectionToolbar) el.selectionToolbar.hidden = !state.selectionMode;
  if (el.selectionModeButton) {
    el.selectionModeButton.setAttribute('aria-pressed', String(state.selectionMode));
    el.selectionModeButton.classList.toggle('active', state.selectionMode);
  }
  if (el.selectionCountText) el.selectionCountText.textContent = `${count.toLocaleString('ko-KR')}개`;
  if (el.selectionDeleteBtn) el.selectionDeleteBtn.disabled = count === 0;
  if (el.selectionMoveBtn) el.selectionMoveBtn.disabled = count === 0;
  el.fileGrid?.classList.toggle('selection-mode', state.selectionMode);
  el.fileGrid?.querySelectorAll?.('.file-card').forEach((card) => {
    const selected = state.selectedFileIds.has(card.dataset.fileId);
    card.classList.toggle('selected', selected);
    card.querySelector('.file-card-open')?.setAttribute('aria-pressed', String(selected));
    const check = card.querySelector('.file-card-select-check');
    if (check) check.setAttribute('aria-hidden', String(!state.selectionMode));
  });
}

let cancelPendingCardPress = null;

function installCardSelectionGestures(button, file) {
  const card = button.closest?.('.file-card') || button;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let suppressClick = false;
  let cleanupGlobal = () => {};
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pointerId = null;
    card.classList.remove('long-press-pending');
    cleanupGlobal();
    cleanupGlobal = () => {};
    if (cancelPendingCardPress === clear) cancelPendingCardPress = null;
  };
  button.addEventListener('pointerdown', (event) => {
    cancelPendingCardPress?.();
    if (event.isPrimary === false || event.button !== 0 || isReservedBackStart(event.clientX)) return;
    suppressClick = false;
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    card.classList.add('long-press-pending');
    cancelPendingCardPress = clear;
    const secondPointer = other => { if (other.pointerId !== pointerId) clear(); };
    const hidden = () => { if (document.visibilityState === 'hidden') clear(); };
    document.addEventListener('pointerdown', secondPointer, true);
    document.addEventListener('scroll', clear, true);
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('blur', clear);
    cleanupGlobal = () => {
      document.removeEventListener('pointerdown', secondPointer, true);
      document.removeEventListener('scroll', clear, true);
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('blur', clear);
    };
    timer = setTimeout(() => {
      const connected = button.isConnected !== false;
      clear();
      if (!connected || (el.playerSheet && !el.playerSheet.hidden)) return;
      suppressClick = true;
      enterSelectionMode(file);
      navigator.vibrate?.(12);
    }, 520);
  });
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) clear();
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'lostpointercapture'].forEach((type) => button.addEventListener(type, clear));
  button.addEventListener('dragstart', event => { event.preventDefault(); clear(); });
  button.addEventListener('selectstart', event => event.preventDefault());
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    clear();
    suppressClick = true;
    if (!state.selectionMode) enterSelectionMode(file);
  });
  button.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    if (state.selectionMode) {
      event.preventDefault();
      toggleFileSelection(file);
    }
  });
}

const FILENAME_EPISODE_PATTERN = /(?:^|[\s._\-\[\]()])EP[.\s]*(\d{1,3})(?=$|[\s._\-\[\]()])/i;
const FILENAME_PART_PATTERN = /(?:^|[\s._\-\[\]()])PART[.\s]*(VIII|VII|VI|IV|III|II|IX|X|V|I|\d{1,3})(?=$|[\s._\-\[\]()])/i;

function filenamePartLabel(name) {
  const text = String(name || '');
  const episode = text.match(FILENAME_EPISODE_PATTERN);
  const part = text.match(FILENAME_PART_PATTERN);
  return [episode && `EP.${episode[1]}`, part && `PART${part[1].toUpperCase()}`].filter(Boolean).join(' · ');
}

function createFileCard(file, index = 0, absoluteIndex = index) {
  const isVideo = file.mimeType?.startsWith('video/');
  const isGif = isGifFile(file);
  const isWebp = String(file.mimeType || '').toLowerCase() === 'image/webp'
    || /\.webp$/i.test(String(file.name || ''));
  const useStaticImageThumbnail = isGif || isWebp;
  const canDownload = file.capabilities?.canDownload !== false;
  const card = document.createElement('article');
  card.className = 'file-card';
  card.setAttribute('data-file-id', file.id);
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-card-open';
  const isSelected = state.selectedFileIds.has(file.id);
  button.setAttribute('aria-pressed', String(isSelected));
  if (isSelected) card.classList.add('selected');
  if (index >= (isMobileDevice() ? 16 : 24)) card.classList.add('defer-render');
  button.title = canDownload
    ? `${isVideo ? '영상' : '이미지'} 원본 열기`
    : `${isVideo ? '영상' : '이미지'} Google 호환 재생기로 열기`;
  button.setAttribute('aria-label', `${file.name || '이름 없는 파일'} · ${button.title}`);

  const visual = document.createElement('div');
  visual.className = `file-card-visual ${isVideo ? 'video' : 'image'}`;
  
  if (useStaticImageThumbnail) {
    const placeholder = document.createElement('div');
    placeholder.className = 'file-card-gif-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML = `<svg viewBox="0 0 64 64" fill="none"><rect x="12" y="14" width="40" height="36" rx="8" stroke="currentColor" stroke-width="2"/><path d="m18 43 10-10 7 7 6-6 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="41" cy="25" r="4" fill="currentColor"/></svg><span>${isGif ? 'GIF' : 'WEBP'}</span>`;
    visual.appendChild(placeholder);
    if (file.thumbnailLink) {
      const canvas = document.createElement('canvas');
      canvas.className = 'file-card-thumb file-card-gif-canvas';
      canvas.width = 1;
      canvas.height = 1;
      canvas.setAttribute('aria-hidden', 'true');
      visual.appendChild(canvas);
      const eagerLimit = isMobileDevice() ? 16 : 24;
      registerStaticGifThumbnail(file, canvas, visual, placeholder, index < eagerLimit);
    }
  } else {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'file-card-thumb';
    thumbnail.alt = '';
    const eagerLimit = isMobileDevice() ? 16 : 24;
    const priorityLimit = isMobileDevice() ? 8 : 12;
    thumbnail.loading = index < eagerLimit ? 'eager' : 'lazy';
    if (index < priorityLimit) thumbnail.fetchPriority = 'high';
    thumbnail.decoding = 'async';
    thumbnail.referrerPolicy = 'no-referrer';
    thumbnail.addEventListener('load', () => {
      thumbnail.classList.add('loaded');
      visual.classList.add('has-thumbnail');
    });

    if (file.thumbnailLink) {
      thumbnail.addEventListener('error', () => {
        if (isVideo) requestVideoFrameThumbnail(file, thumbnail, visual);
        else thumbnail.remove();
      }, { once: true });
      if (playerMediaPriorityActive) thumbnail.dataset.playerDeferredSrc = file.thumbnailLink;
      else thumbnail.src = file.thumbnailLink;
      visual.appendChild(thumbnail);
    } else if (isVideo) {
      visual.appendChild(thumbnail);
      requestVideoFrameThumbnail(file, thumbnail, visual);
    }
  }

  // Format Badge (e.g., 4K UHD, FHD, HEVC, PNG)
  const res = resolutionText(file);
  let badgeLabel = isVideo ? 'VIDEO' : 'IMAGE';
  if (res) {
    badgeLabel = res;
  } else if (file.videoMediaMetadata?.width >= 3840) {
    badgeLabel = '4K UHD';
  } else if (file.videoMediaMetadata?.width >= 1920) {
    badgeLabel = 'FHD';
  } else if (file.mimeType) {
    badgeLabel = friendlyMime(file.mimeType);
  }

  const badge = document.createElement('span');
  badge.className = 'file-card-badge';
  badge.textContent = badgeLabel;
  visual.appendChild(badge);

  const selectionCheck = document.createElement('span');
  selectionCheck.className = 'file-card-select-check';
  selectionCheck.setAttribute('aria-hidden', String(!state.selectionMode));
  selectionCheck.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 4 4L19 6"/></svg>';
  visual.appendChild(selectionCheck);

  // Video Duration Badge (e.g., 03:42)
  if (isVideo && file.videoMediaMetadata?.durationMillis) {
    const durationSec = Number(file.videoMediaMetadata.durationMillis) / 1000;
    if (durationSec > 0) {
      const durBadge = document.createElement('span');
      durBadge.className = 'file-card-duration-badge';
      durBadge.textContent = formatPlayerTime(durationSec);
      visual.appendChild(durBadge);
    }
  }

  // Play overlay on hover for video
  if (isVideo) {
    const overlay = document.createElement('div');
    overlay.className = 'file-card-play-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('div');
    glyph.className = 'play-glyph-circle';
    glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    overlay.appendChild(glyph);
    visual.appendChild(overlay);
  }

  const body = document.createElement('div');
  body.className = 'file-card-body';
  const name = document.createElement('span');
  name.className = 'file-card-title';
  name.textContent = file.name || '이름 없는 파일';
  const nameButton = document.createElement('button');
  nameButton.type = 'button';
  nameButton.className = 'file-card-name-button';
  nameButton.setAttribute('aria-label', `${name.textContent} · 전체 파일명 보기`);
  nameButton.setAttribute('aria-haspopup', 'dialog');
  nameButton.setAttribute('aria-controls', 'fileNameDialog');
  nameButton.title = name.textContent;
  nameButton.append(name);
  
  const meta = document.createElement('div');
  meta.className = 'file-card-meta';
  if (file.__origin) {
    const origin = document.createElement('span');
    origin.className = 'file-card-origin';
    origin.textContent = file.__origin;
    meta.appendChild(origin);
  }
  const details = document.createElement('span');
  details.textContent = formatBytes(file.size);
  meta.append(details);
  // Only informative states earn the slot; the card itself already opens the original.
  const statusText = canDownload ? filenamePartLabel(file.name) : '다운로드 제한';
  if (statusText) {
    const status = document.createElement('span');
    status.className = 'file-card-status';
    status.textContent = statusText;
    meta.append(status);
  }

  body.append(nameButton, meta);
  button.append(visual);
  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = 'file-card-favorite';
  favoriteButton.dataset.fileId = file.id;
  applyFavoriteButtonState(favoriteButton, isFavoriteFileId(file.id));
  favoriteButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  favoriteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const liked = setFavoriteFile(file.id, !isFavoriteFileId(file.id));
    flashPressed(favoriteButton);
    showToast(liked ? '좋아요에 추가했습니다.' : '좋아요를 취소했습니다.');
  });
  card.append(button, body, favoriteButton);
  installCardPinPrewarm(button, file);
  installCardSelectionGestures(button, file);
  installCardSelectionGestures(nameButton, file);
  nameButton.addEventListener('click', () => {
    if (state.selectionMode) return;
    // The full name only adds something when the clamped title actually hides part of it.
    const clipped = !(name.scrollHeight <= name.clientHeight + 1 && name.scrollWidth <= name.clientWidth + 1);
    if (!clipped) { openPlayer(file); return; }
    el.fileNameText.textContent = file.name || '이름 없는 파일';
    if (!el.fileNameDialog.open) el.fileNameDialog.showModal();
  });
  button.addEventListener('click', () => {
    if (state.selectionMode) return;
    openPlayer(file);
  });
  return card;
}

function updateLibrarySummary(visibleCount, visibleFolderCount) {
  updateListLoadingUI();
  const mediaCount = Number.isFinite(visibleCount) ? visibleCount : filteredAndSortedFiles().length;
  if (state.filter === 'favorites') {
    el.librarySummary.textContent = `좋아요 미디어 ${mediaCount.toLocaleString('ko-KR')}개 · 모든 폴더`;
    return;
  }
  const folderCount = Number.isFinite(visibleFolderCount) ? visibleFolderCount : state.filter === 'all'
    ? state.folders.filter(matchesLibraryQuery).length : 0;
  const parts = [];
  if (folderCount > 0) parts.push(`폴더 ${folderCount.toLocaleString('ko-KR')}개`);
  const ordinaryView = !state.deepScan;
  const partial = ordinaryView && !state.populationComplete;
  const filtered = Boolean(state.query) || state.filter !== 'all';
  const typeLabel = state.query ? '검색 결과' : state.filter === 'video' ? '영상' : state.filter === 'image' ? '이미지' : '미디어';
  if (state.loadingFiles && !state.files.length && !state.folders.length) {
    parts.push('목록을 불러오는 중…');
  } else {
    parts.push(`${typeLabel} ${mediaCount.toLocaleString('ko-KR')}개${partial && !filtered ? ' 수집' : ''}`);
    if (filtered && ordinaryView) parts.push(`${partial ? '수집한' : '전체'} 미디어 ${state.files.length.toLocaleString('ko-KR')}개`);
    if (state.listLoadError) parts.push('목록 수집 중단');
    else if (partial && (state.loadingFiles || state.nextPageToken)) parts.push('목록 확인 중…');
  }
  if (state.deepScan && state.treeCache) parts.push('하위 폴더 전체 포함');
  el.librarySummary.textContent = parts.join(' · ');
}

