'use strict';

const APP_VERSION = '1.19.0';
const CLIENT_ID_KEY = 'drive-original.oauth-client-id';
const DEFAULT_OAUTH_CLIENT_ID = '376776089602-t0te7oadl7ki589fnfdfhs173gco2n0l.apps.googleusercontent.com';
const TOKEN_STORAGE_KEY = 'drive-original.oauth-token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_SKEW_MS = 30_000;
const MOBILE_MEMORY_BUFFER_AUTO_LIMIT = 24 * 1024 * 1024;
const MOBILE_MEMORY_BUFFER_HARD_LIMIT = 64 * 1024 * 1024;
const DESKTOP_MEMORY_BUFFER_AUTO_LIMIT = 96 * 1024 * 1024;
const DESKTOP_MEMORY_BUFFER_HARD_LIMIT = 256 * 1024 * 1024;
const MOBILE_DISK_BUFFER_AUTO_LIMIT = 64 * 1024 * 1024;
const DESKTOP_DISK_BUFFER_AUTO_LIMIT = 256 * 1024 * 1024;
const ORIGINAL_BUFFER_DIRECTORY = 'drive-original-temp';
const VERTICAL_DECK_DEPTH = 2;
const THUMBNAIL_WARM_LIMIT = 12;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_PAGE_SIZE = 1000;
const RENDER_WINDOW_MAX = 240;
const RENDER_WINDOW_STEP_RATIO = 0.5;
const MOVE_RESULT_BATCH = 200;
const FOLDER_RENDER_MAX = 200;
const BULK_ACTION_CONCURRENCY = 4;
const DEFAULT_FRAME_DURATION = 1 / 30;
const MEDIA_ERROR_CLASSIFY_DELAY_MS = 180;
const DRIVE_PREVIEW_SLOW_MS = 8_000;
const DRIVE_PREVIEW_TIMEOUT_MS = 30_000;
const MAX_ORIGINAL_RETRY_AFTER_MS = 10_000;
const GIF_THUMBNAIL_SIZE = 320;
const ACCOUNT_STATE_FILE_NAME = 'drive-original-account-state.json';
const ACCOUNT_STATE_CACHE_PREFIX = 'drive-original.account-state.';
const ACCOUNT_STATE_SCHEMA_VERSION = 1;
const ACCOUNT_STATE_SYNC_DELAY_MS = 650;
const PLAYBACK_MODE = Object.freeze({
  RANGE: 'original-range',
  SEQUENTIAL: 'original-sequential',
  OPFS: 'original-opfs',
  MEMORY: 'original-memory',
  COMPATIBILITY: 'compatibility-preview'
});

function classifyMediaProxyFailure(data = {}) {
  const status = Number(data.status) || 0;
  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const driveReason = String(data.driveReason || reasons[0] || '');
  const category = String(data.category || '');
  if (category === 'auth' || status === 401) return 'auth';
  if (category === 'rate-limit' || status === 429 || /rateLimitExceeded/i.test(driveReason)) return 'rate-limit';
  if (category === 'not-found' || status === 404) return 'not-found';
  if (status === 416 || category === 'range-not-satisfiable') return 'range-416';
  if (category === 'range-invalid' || data.rangeSatisfied === false) return 'range-invalid';
  if (status === 403 && isDriveDownloadRestriction(data)) return 'download-restricted';
  if (category === 'permission' || status === 403) return 'permission';
  if (category === 'server' || status >= 500) return 'server';
  if (category === 'network' || status === 0) return 'network';
  return 'http';
}

function isDriveSecurityRestriction(data = {}) {
  const values = [data.driveReason, ...(Array.isArray(data.reasons) ? data.reasons : [])];
  return values.some((value) => /abus|malware|virus/i.test(String(value || '')));
}

function isDriveDownloadRestriction(data = {}) {
  const values = [data.driveReason, ...(Array.isArray(data.reasons) ? data.reasons : [])];
  return values.some((value) => /cannotDownload|fileNotDownloadable|download(?:ing)?(?:Is)?(?:Disabled|Restricted|NotAllowed|LimitExceeded)|download_restricted/i.test(String(value || '')));
}

function getUnsatisfiedRangeSize(contentRange) {
  const match = /^bytes\s+\*\/(\d+)$/i.exec(String(contentRange || '').trim());
  if (!match) return null;
  const size = Number(match[1]);
  return Number.isSafeInteger(size) && size >= 0 ? size : null;
}

function isLocalOriginalStorageError(error) {
  return ['QuotaExceededError', 'NotSupportedError', 'InvalidStateError', 'NoModificationAllowedError']
    .includes(String(error?.name || ''))
    || /\bOPFS\b|quota|temporary storage/i.test(String(error?.message || ''));
}

function decideMediaRecovery({
  cause,
  isVideo = true,
  downloadAllowed = true,
  rangeRetryCount = 0,
  rangeRebuildCount = 0,
  permissionRetryCount = 0
} = {}) {
  if (cause === 'auth') return 'refresh-auth';
  if (cause === 'not-found') return 'fail-not-found';
  if (!downloadAllowed || cause === 'download-restricted') return 'compatibility';
  if (cause === 'unsupported') return 'compatibility';
  if (cause === 'permission') {
    return permissionRetryCount < 1 ? 'refresh-permission' : 'fail-permission';
  }
  if (!isVideo) return 'buffer-original';
  if (cause === 'range-416' && rangeRebuildCount < 1 && rangeRetryCount < 1) return 'rebuild-range';
  if (rangeRetryCount < 1) return 'retry-range';
  return 'buffer-original';
}

function shouldCommitSwipe(primaryDelta, crossDelta, elapsedMs, axisSize = 400) {
  const primary = Math.abs(Number(primaryDelta) || 0);
  const cross = Math.abs(Number(crossDelta) || 0);
  const elapsed = Math.max(1, Number(elapsedMs) || 1);
  const distanceThreshold = Math.min(132, Math.max(72, (Number(axisSize) || 400) * 0.18));
  const dominant = primary >= Math.max(1, cross) * 1.35;
  if (!dominant) return false;
  if (primary >= distanceThreshold) return true;
  return primary >= 48 && primary / elapsed >= 0.55;
}

function shouldCommitLockedSwipe(directionalDelta, elapsedMs, axisSize = 400) {
  const primary = Math.max(0, Number(directionalDelta) || 0);
  const elapsed = Math.max(1, Number(elapsedMs) || 1);
  const distanceThreshold = Math.min(132, Math.max(72, (Number(axisSize) || 400) * 0.18));
  if (primary >= distanceThreshold) return true;
  return primary >= 48 && primary / elapsed >= 0.55;
}

async function runTaskPool(items, worker, concurrency = BULK_ACTION_CONCURRENCY) {
  const source = Array.isArray(items) ? items : [];
  const results = new Array(source.length);
  let cursor = 0;
  const runner = async () => {
    while (cursor < source.length) {
      const index = cursor++;
      const item = source[index];
      try {
        results[index] = { item, status: 'fulfilled', value: await worker(item, index) };
      } catch (reason) {
        results[index] = { item, status: 'rejected', reason };
      }
    }
  };
  const count = Math.min(source.length, Math.max(1, Math.floor(Number(concurrency) || 1)));
  await Promise.all(Array.from({ length: count }, () => runner()));
  return results;
}

function isGifFile(file) {
  if (!file) return false;
  if (String(file.mimeType || '').toLowerCase() === 'image/gif') return true;
  return /\.gif$/i.test(String(file.name || ''));
}

function resolveMediaDoubleTapAction(clientX, stageLeft, stageWidth, isVideo) {
  const width = Math.max(1, Number(stageWidth) || 1);
  const normalizedX = (Number(clientX) - (Number(stageLeft) || 0)) / width;
  if (isVideo && normalizedX <= 0.18) return 'seek-backward';
  if (isVideo && normalizedX >= 0.82) return 'seek-forward';
  return 'favorite';
}

function createEmptyAccountMediaState() {
  return {
    schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
    updatedAt: 0,
    viewed: {},
    favorites: {}
  };
}

function normalizeAccountMediaState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const viewed = {};
  const favorites = {};
  Object.entries(source.viewed && typeof source.viewed === 'object' ? source.viewed : {}).forEach(([id, timestamp]) => {
    const normalized = Math.max(0, Number(timestamp) || 0);
    if (id && normalized) viewed[id] = normalized;
  });
  Object.entries(source.favorites && typeof source.favorites === 'object' ? source.favorites : {}).forEach(([id, entry]) => {
    if (!id) return;
    const normalized = entry && typeof entry === 'object'
      ? { liked: Boolean(entry.liked), updatedAt: Math.max(0, Number(entry.updatedAt) || 0) }
      : { liked: Boolean(entry), updatedAt: 0 };
    favorites[id] = normalized;
  });
  return {
    schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
    updatedAt: Math.max(0, Number(source.updatedAt) || 0),
    viewed,
    favorites
  };
}

function mergeAccountMediaStates(first, second) {
  const left = normalizeAccountMediaState(first);
  const right = normalizeAccountMediaState(second);
  const merged = createEmptyAccountMediaState();
  const viewedIds = new Set([...Object.keys(left.viewed), ...Object.keys(right.viewed)]);
  viewedIds.forEach((id) => {
    merged.viewed[id] = Math.max(left.viewed[id] || 0, right.viewed[id] || 0);
  });
  const favoriteIds = new Set([...Object.keys(left.favorites), ...Object.keys(right.favorites)]);
  favoriteIds.forEach((id) => {
    const a = left.favorites[id];
    const b = right.favorites[id];
    if (!a) merged.favorites[id] = b;
    else if (!b) merged.favorites[id] = a;
    else merged.favorites[id] = (b.updatedAt || 0) >= (a.updatedAt || 0) ? b : a;
  });
  merged.updatedAt = Math.max(left.updatedAt, right.updatedAt);
  return merged;
}

function accountFavoriteIds(accountState) {
  const normalized = normalizeAccountMediaState(accountState);
  return new Set(Object.entries(normalized.favorites)
    .filter(([, entry]) => entry.liked)
    .map(([id]) => id));
}

function accountViewedIds(accountState) {
  return new Set(Object.keys(normalizeAccountMediaState(accountState).viewed));
}

function prioritizeUnseenFiles(files, viewedIds, selectedId = null) {
  const viewed = viewedIds instanceof Set ? viewedIds : new Set(viewedIds || []);
  const candidates = (Array.isArray(files) ? files : [])
    .filter((file) => file?.id && file.id !== selectedId);
  return [
    ...candidates.filter((file) => !viewed.has(file.id)),
    ...candidates.filter((file) => viewed.has(file.id))
  ];
}

async function collectAllPages(fetchPage, { signal, onPage } = {}) {
  const items = [];
  const seenTokens = new Set();
  let nextPageToken = null;
  let incompleteSearch = false;

  do {
    if (signal?.aborted) throw new DOMException('Collection aborted', 'AbortError');
    const page = await fetchPage(nextPageToken);
    const pageItems = Array.isArray(page?.items)
      ? page.items
      : Array.isArray(page?.files)
        ? page.files
        : [];
    items.push(...pageItems);
    incompleteSearch = incompleteSearch || Boolean(page?.incompleteSearch);
    onPage?.({ count: items.length, pageCount: pageItems.length });

    const next = page?.nextPageToken || null;
    if (next && seenTokens.has(next)) {
      throw new Error(`Repeated page token: ${next}`);
    }
    if (next) seenTokens.add(next);
    nextPageToken = next;
  } while (nextPageToken);

  return { items, incompleteSearch };
}

function computeRenderWindow(totalCount, requestedStart, columnCount) {
  const total = Math.max(0, Number(totalCount) || 0);
  const columns = Math.max(1, Math.floor(Number(columnCount) || 1));
  const windowSize = Math.max(columns, Math.floor(RENDER_WINDOW_MAX / columns) * columns);
  if (!total) return { start: 0, end: 0 };

  const clamped = Math.max(0, Math.min(Number(requestedStart) || 0, total - 1));
  const start = Math.floor(clamped / columns) * columns;
  return { start, end: Math.min(total, start + windowSize) };
}

function buildMoveFolderRows(catalog) {
  const roots = Array.isArray(catalog?.roots) ? catalog.roots : [];
  const folders = Array.isArray(catalog?.folders) ? catalog.folders : [];
  const childrenByParent = new Map();
  const seen = new Set();
  const rows = [];

  folders.forEach((folder) => {
    const parentId = folder.parents?.[0] || null;
    if (!childrenByParent.has(parentId)) childrenByParent.set(parentId, []);
    childrenByParent.get(parentId).push(folder);
  });
  childrenByParent.forEach((children) => {
    children.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true }));
  });

  const appendTree = (rootFolder, rootDepth, orphaned = false) => {
    const queue = [{ folder: rootFolder, depth: rootDepth, orphaned }];
    while (queue.length) {
      const { folder, depth, orphaned: rowOrphaned } = queue.shift();
      if (!folder?.id || seen.has(folder.id)) continue;
      seen.add(folder.id);
      rows.push({ ...folder, depth, orphaned: rowOrphaned });
      (childrenByParent.get(folder.id) || []).forEach((child) => {
        queue.push({ folder: child, depth: depth + 1, orphaned: rowOrphaned });
      });
    }
  };

  roots.forEach((root) => appendTree({ ...root, isRoot: true }, 0));

  folders
    .filter((folder) => !seen.has(folder.id))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true }))
    .forEach((folder) => appendTree(folder, 1, true));

  return rows;
}

function pickRandomFile(files, selectedId, random = Math.random) {
  const population = Array.isArray(files) ? files : [];
  if (!population.length) return null;
  if (population.length === 1) return population[0];
  const candidates = selectedId ? population.filter((file) => file.id !== selectedId) : population;
  if (!candidates.length) return population[0];
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}

function buildVerticalPlaybackDeck(files, selectedId, random = Math.random, depth = VERTICAL_DECK_DEPTH, viewedIds = null) {
  const watched = viewedIds instanceof Set ? viewedIds : new Set(viewedIds || []);
  const uniqueFiles = [];
  const uniqueIds = new Set(selectedId ? [selectedId] : []);
  (Array.isArray(files) ? files : []).forEach((file) => {
    if (!file?.id || uniqueIds.has(file.id)) return;
    uniqueIds.add(file.id);
    uniqueFiles.push(file);
  });
  const shuffleIds = (items) => {
    const ids = items.map((file) => file.id);
    for (let index = ids.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
      [ids[index], ids[swapIndex]] = [ids[swapIndex], ids[index]];
    }
    return ids;
  };
  // Shuffle within each group, never across the boundary: unseen media stays
  // ahead of watched media until the account has exhausted the population.
  const unique = [
    ...shuffleIds(uniqueFiles.filter((file) => !watched.has(file.id))),
    ...shuffleIds(uniqueFiles.filter((file) => watched.has(file.id)))
  ];
  const targetDepth = Math.max(0, Math.floor(Number(depth) || 0));
  const above = unique.slice(0, targetDepth);
  const below = unique.slice(targetDepth, targetDepth * 2);
  // Tiny libraries cannot provide four distinct neighbours. Reuse only after
  // exhausting every distinct candidate so navigation always remains possible.
  let cursor = 0;
  while (unique.length && above.length < targetDepth) above.push(unique[cursor++ % unique.length]);
  while (unique.length && below.length < targetDepth) below.push(unique[cursor++ % unique.length]);
  return { anchorId: selectedId || null, above, below };
}

function advanceVerticalPlaybackDeck(deck, direction, targetId, files, random = Math.random, viewedIds = null) {
  const current = deck?.anchorId || null;
  const next = {
    anchorId: targetId || current,
    above: Array.isArray(deck?.above) ? [...deck.above] : [],
    below: Array.isArray(deck?.below) ? [...deck.below] : []
  };
  if (!targetId || !current || targetId === current) return next;
  if (direction === 'up') {
    next.below = next.below.filter((id) => id !== targetId);
    next.above = [current, ...next.above.filter((id) => id !== current && id !== targetId)]
      .slice(0, VERTICAL_DECK_DEPTH);
  } else {
    next.above = next.above.filter((id) => id !== targetId);
    next.below = [current, ...next.below.filter((id) => id !== current && id !== targetId)]
      .slice(0, VERTICAL_DECK_DEPTH);
  }
  const population = Array.isArray(files) ? files : [];
  const validIds = new Set(population.filter((file) => file?.id).map((file) => file.id));
  next.above = next.above.filter((id) => validIds.has(id) && id !== next.anchorId);
  next.below = next.below.filter((id) => validIds.has(id) && id !== next.anchorId);
  const excluded = new Set([next.anchorId, ...next.above, ...next.below]);
  const shuffled = buildVerticalPlaybackDeck(
    population.filter((file) => !excluded.has(file.id)),
    next.anchorId,
    random,
    VERTICAL_DECK_DEPTH,
    viewedIds
  );
  const fill = [...shuffled.above, ...shuffled.below];
  while (next.above.length < VERTICAL_DECK_DEPTH && fill.length) next.above.push(fill.shift());
  while (next.below.length < VERTICAL_DECK_DEPTH && fill.length) next.below.push(fill.shift());
  // Small libraries cannot keep four distinct neighbours, but the spatial
  // window must still stay fully assigned after every move. Reuse only after
  // all distinct candidates have already been consumed.
  const reusable = prioritizeUnseenFiles(population, viewedIds, next.anchorId).map((file) => file.id);
  let reuseCursor = 0;
  while (reusable.length && next.above.length < VERTICAL_DECK_DEPTH) {
    next.above.push(reusable[reuseCursor++ % reusable.length]);
  }
  while (reusable.length && next.below.length < VERTICAL_DECK_DEPTH) {
    next.below.push(reusable[reuseCursor++ % reusable.length]);
  }
  return next;
}

function getOriginalBufferPolicy({
  size = 0,
  mobile = false,
  opfsAvailable = false,
  storageAvailable = 0
} = {}) {
  const bytes = Math.max(0, Number(size) || 0);
  const memoryAuto = mobile ? MOBILE_MEMORY_BUFFER_AUTO_LIMIT : DESKTOP_MEMORY_BUFFER_AUTO_LIMIT;
  const memoryHard = mobile ? MOBILE_MEMORY_BUFFER_HARD_LIMIT : DESKTOP_MEMORY_BUFFER_HARD_LIMIT;
  const diskAuto = mobile ? MOBILE_DISK_BUFFER_AUTO_LIMIT : DESKTOP_DISK_BUFFER_AUTO_LIMIT;
  const safeStorage = Math.max(0, Math.floor((Number(storageAvailable) || 0) * 0.8));
  if (opfsAvailable && safeStorage > 0 && (!bytes || bytes <= safeStorage)) {
    return { decision: bytes && bytes <= diskAuto ? 'auto' : 'confirm', mode: 'disk', hardLimit: safeStorage };
  }
  if (!bytes) return { decision: 'confirm', mode: 'memory', hardLimit: memoryHard };
  if (bytes <= memoryAuto) return { decision: 'auto', mode: 'memory', hardLimit: memoryHard };
  if (bytes <= memoryHard) return { decision: 'confirm', mode: 'memory', hardLimit: memoryHard };
  return { decision: 'denied', mode: 'memory', hardLimit: memoryHard };
}

function chooseInitialOriginalPlaybackRoute({ isVideo = false, policy = null } = {}) {
  if (isVideo && policy?.mode === 'disk' && policy?.decision === 'auto') {
    return PLAYBACK_MODE.OPFS;
  }
  return PLAYBACK_MODE.RANGE;
}

function buildResourceKeysHeader(items) {
  const pairs = [];
  const seen = new Set();
  (Array.isArray(items) ? items : []).forEach((item) => {
    if (!item?.id || !item.resourceKey || seen.has(item.id)) return;
    seen.add(item.id);
    pairs.push(`${item.id}/${item.resourceKey}`);
  });
  return pairs.join(',');
}

function normalizeClientIdOverride(value) {
  const clientId = String(value || '').trim();
  if (!clientId || clientId === DEFAULT_OAUTH_CLIENT_ID || !validateClientId(clientId)) return '';
  return clientId;
}

function loadClientIdOverride() {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY) || '';
    const override = normalizeClientIdOverride(stored);
    if (stored && !override) localStorage.removeItem(CLIENT_ID_KEY);
    return override;
  } catch (_) {
    return '';
  }
}

const initialClientIdOverride = loadClientIdOverride();
const state = {
  clientIdOverride: initialClientIdOverride,
  clientId: initialClientIdOverride || DEFAULT_OAUTH_CLIENT_ID,
  token: null,
  expiresAt: 0,
  tokenClient: null,
  folders: [],
  files: [],
  nextPageToken: null,
  currentFolderId: 'root',
  currentFolderName: '내 드라이브',
  folderStack: [],
  deepScan: false,
  treeCache: null,
  loadingTree: false,
  rootFolderId: null,
  videoRotated: false,
  treeAbort: null,
  folderIndex: null,
  loadingFolderIndex: false,
  accountId: null,
  accountMediaState: createEmptyAccountMediaState(),
  accountStateFileId: null,
  accountStateLoaded: false,
  accountStateLoadingPromise: null,
  accountStateSyncPromise: null,
  accountStateSyncTimer: null,
  accountStateRevision: 0,
  accountStateLastSyncAt: 0,
  favoriteFiles: [],
  loadingFavorites: false,
  moveTargetFolderId: null,
  moving: false,
  filter: 'all',
  query: '',
  sort: 'modifiedTime',
  selected: null,
  selectionMode: false,
  selectedFileIds: new Set(),
  pendingActionFiles: [],
  bulkAction: false,
  serviceWorkerRegistration: null,
  loadingFiles: false,
  listGeneration: 0,
  listAbortController: null,
  listRequestPromise: null,
  populationLoadPromise: null,
  populationComplete: false,
  renderWindowStart: 0,
  renderRowHeight: 250,
  renderColumnCount: 1,
  renderScrollDirection: 'down',
  retryAfterAuth: false,
  authRetryContext: null,
  mediaAttempt: 'idle',
  mediaPlaybackMode: '',
  mediaTransportVerified: false,
  mediaRangeIntegrity: 'unknown',
  mediaDecodeVerified: false,
  mediaBlobUrl: null,
  mediaAbortController: null,
  mediaSession: 0,
  mediaRetryCount: 0,
  mediaRangeRebuildCount: 0,
  mediaPermissionRetryCount: 0,
  mediaFullRequestCount: 0,
  mediaExhaustedOriginalModes: new Set(),
  mediaAbuseAcknowledged: false,
  pendingSecurityConfirmation: null,
  mediaBufferStorageMode: '',
  mediaTempStorage: null,
  pendingOriginalBuffer: null,
  drivePreviewReason: '',
  lastProxyError: null,
  playbackSession: 0,
  controlsTimeout: null,
  isSeeking: false,
  pendingPlay: false,
  resumePosition: null,
  deleting: false,
  folderIndexPromise: null,
  folderIndexAbortController: null,
  moveFolderRows: [],
  moveResultLimit: MOVE_RESULT_BATCH,
  folderRenderLimit: FOLDER_RENDER_MAX,
  randomRequestGeneration: 0,
  treeCachePromise: null,
  authGeneration: 0,
  frameDuration: DEFAULT_FRAME_DURATION,
  lastPresentedMediaTime: null,
  frameCallbackId: null,
  playbackOrderIds: [],
  playbackDeck: { anchorId: null, above: [], below: [] },
  playbackDeckComplete: false,
  demo: new URLSearchParams(location.search).get('demo') === '1'
};

const el = {};
let toastTimer = null;
let feedbackTimer = null;
let updatePending = false;
let controlsHideTimer = null;
let isSeekingPointer = false;
let isSpeedMenuOpen = false;
let isPlayerMoreOpen = false;
let tokenRenewalTimer = null;
let shuffledOrderMap = new Map();
let tokenRequestPromise = null;
let tokenRequestGeneration = -1;
let tokenRequestBackground = true;
let pendingTokenRequest = null;
let playerReturnFocus = null;
let playbackNavigationChain = Promise.resolve();
let mediaTransitionTimers = [];
let mediaTransitionAnimations = [];
let snapBackTimer = null;
let mediaTransitionCommitting = false;
let swipeCommitPending = false;
let moveRequestGeneration = 0;
let moveParentsAbortController = null;
let mediaRecoveryTimer = null;
let drivePreviewSlowTimer = null;
let drivePreviewTimeoutTimer = null;
let swipePreviewDirection = null;
let swipePreviewTargetId = null;
let swipeGestureDirection = null;
let swipeGestureTargetId = null;
let swipeGestureAwaitingPopulation = false;
let swipeNeighborGeneration = 0;
let swipeStageWidth = 0;
let swipeStageHeight = 0;
let playbackPopulationWarmPromise = null;
let writableOpfsSupportPromise = null;
let edgeBackGesture = null;
const warmedThumbnails = new Map();
let playerMediaPriorityActive = false;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  if (location.search && location.search.includes('_update=')) {
    try {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('_update');
      history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
    } catch (_) {}
  }

  bindElements();
  bindEvents();
  setupTouchGestures();
  setupLibraryEdgeBackGesture();
  setupInfiniteScroll();
  cleanupStaleOriginalBuffers().catch(() => {});
  el.settingsClientId.value = state.clientIdOverride;
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
  if (el.settingsAppVersion) el.settingsAppVersion.textContent = `v${APP_VERSION}`;
  
  await setupServiceWorker();

  if (state.demo) {
    startDemoMode();
  } else if (loadSavedToken()) {
    sendTokenToWorker();
    updateConnectionBadge();
    showLibrary();
    await initializeAccountMediaState().catch((error) => {
      console.warn('Account media state sync was unavailable:', error);
    });
    loadFiles({ append: false });
  } else {
    // GIS token requests require a user gesture. Never open an OAuth dialog
    // automatically on first load, even when the built-in client ID is ready.
    updateConnectionBadge();
    showSetup();
  }
}

function bindElements() {
  const ids = [
    'brandButton', 'connectionBadge', 'settingsButton', 'settingsUpdateDot',
    'updateBanner', 'updateBannerText', 'bannerUpdateButton', 'closeBannerButton',
    'setupView', 'libraryView', 'clientIdHint',
    'connectButton', 'openSetupHelp', 'librarySummary', 'refreshButton', 'searchInput',
    'sortSelect', 'libraryStatus', 'fileGrid', 'emptyState', 'emptyStateTitle', 'emptyStateText', 'loadMoreButton',
    'selectionModeButton', 'selectionToolbar', 'selectionCountText', 'selectionSelectAllBtn',
    'selectionMoveBtn', 'selectionDeleteBtn', 'selectionCancelBtn',
    'infiniteScrollSentinel', 'infiniteScrollSpinner',
    'folderNav', 'breadcrumbTrail', 'folderUpButton', 'libraryTitle', 'folderStrip', 'folderMoreButton', 'edgeBackIndicator',
    'playerSheet', 'playerBackdrop', 'playerModal', 'playerTitle', 'topbarPrevBtn', 'topbarRandomBtn', 'topbarNextBtn',
    'topbarFavoriteBtn',
    'fullscreenButton', 'iconExpand', 'iconCompress', 'closePlayerButton',
    'mediaStage', 'ambientBackdrop', 'videoPlayer', 'imageViewer',
    'mediaSwipeNeighbor', 'mediaSwipeNeighborBackdrop', 'mediaSwipeNeighborImage', 'mediaSwipeNeighborTitle',
    'drivePreview', 'drivePreviewActions', 'drivePreviewRetryButton', 'drivePreviewOpenButton', 'playerFeedback', 'favoriteFeedback',
    'mobileShortsOverlay', 'mobileShortsTitle', 'mobileShortsProgressBar', 'mobileShortsProgressTrack',
    'stageCenterPlayBtn',
    'iconCenterPlay', 'iconCenterPause', 'customVideoControls', 'seekBarContainer',
    'seekBarBuffered', 'seekBarPlayed', 'seekBarThumb', 'seekBarTooltip',
    'ctrlPrevVideo', 'ctrlPlayPause', 'ctrlIconPlay', 'ctrlIconPause', 'ctrlNextVideo', 'ctrlRandomShorts',
    'ctrlRewind', 'ctrlFramePrev', 'ctrlFrameNext', 'ctrlForward', 'ctrlDelete', 'ctrlMove',
    'shortsExpandRow', 'shortsDeleteBtn', 'shortsDriveBtn', 'shortsPipBtn', 'shortsMoveBtn', 'shortsFramePrev', 'shortsFrameNext',
    'shortsFullscreenBtn', 'shortsMoreBtn', 'shortsRotateBtn', 'shortsFavoriteBtn', 'deepScanToggle', 'deepScanStopBtn',
    'moveDialog', 'moveFileName', 'moveSearchInput', 'moveFolderList', 'moveCancelButton', 'moveConfirmButton',
    'volumeControlGroup', 'ctrlMute', 'ctrlIconVolHigh', 'ctrlIconVolMuted',
    'ctrlVolumeSlider', 'ctrlTimeDisplay', 'ctrlCurrentTime', 'ctrlTotalTime',
    'speedMenuWrap', 'ctrlSpeedButton', 'ctrlSpeedText', 'speedDropdown', 'playerMoreMenu',
    'ctrlFavorite', 'ctrlPip', 'ctrlFullscreen', 'ctrlIconExpand', 'ctrlIconCompress',
    'mediaLoading', 'mediaLoadingText', 'mediaError', 'mediaErrorTitle', 'mediaErrorMessage',
    'retryMediaButton', 'bufferOriginalButton', 'compatPlayerButton', 'openDriveButton', 'streamModeLabel', 'streamModeText',
    'qualityBadge', 'mediaResolution',
    'mediaFileSizeType', 'codecNote', 'settingsDialog', 'settingsAppVersion',
    'updateStatusText', 'checkUpdateButton', 'applyUpdateButton', 'forceReloadButton',
    'settingsClientId', 'settingsClientIdHint', 'saveSettingsButton', 'disconnectButton', 'setupHelpSection',
    'currentOrigin', 'copyOriginButton', 'appVersion', 'toast',
    'deleteDialog', 'deleteFileName', 'deleteCancelButton', 'deleteConfirmButton',
    'permissionDialog', 'permissionReconnectButton', 'permissionCloseButton',
    'seekHintLeft', 'seekHintRight'
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
  el.filterButtons = [...document.querySelectorAll('[data-filter]')];
  el.speedButtons = [...document.querySelectorAll('#speedDropdown [data-speed]')];
}

function bindDialogLightDismiss(dialog) {
  if (!dialog) return;
  let startedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    startedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (!startedOnBackdrop || event.target !== dialog || state.deleting || state.moving || state.bulkAction) return;
    startedOnBackdrop = false;
    dialog.close();
  });
  dialog.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
}

function bindEvents() {
  el.connectButton.addEventListener('click', beginAuthorization);
  el.openSetupHelp.addEventListener('click', () => openSettings(true));
  el.settingsButton.addEventListener('click', () => openSettings(false));
  el.brandButton.addEventListener('click', () => {
    closePlayer();
    if (state.token || state.demo) showLibrary();
  });
  el.refreshButton.addEventListener('click', () => {
    state.treeCache = null;
    state.folderIndex = null;
    state.moveFolderRows = [];
    if (state.filter === 'favorites') loadFavoriteFiles();
    else applyFolderView();
  });
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase('ko');
    state.folderRenderLimit = FOLDER_RENDER_MAX;
    renderFiles({ resetWindow: true });
  });
  el.sortSelect.addEventListener('change', async (event) => {
    state.sort = event.target.value;
    if (state.sort === 'random') {
      if (state.filter === 'favorites') {
        shuffleCurrentFiles();
        renderFiles({ resetWindow: true });
        return;
      }
      const generation = state.listGeneration;
      el.libraryStatus.textContent = '대상 폴더의 전체 미디어를 모아 무작위로 섞는 중…';
      try {
        await ensureAllPagesLoaded();
        if (generation !== state.listGeneration || state.sort !== 'random') return;
        shuffleCurrentFiles();
        renderFiles({ resetWindow: true });
        el.libraryStatus.textContent = '';
      } catch (error) {
        if (error?.name !== 'AbortError') {
          el.libraryStatus.textContent = `전체 파일을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
        }
      }
    } else {
      renderFiles({ resetWindow: true });
    }
  });
  el.filterButtons.forEach((button) => button.addEventListener('click', () => {
    setLibraryFilter(button.dataset.filter);
  }));
  el.loadMoreButton.addEventListener('click', () => {
    if (state.nextPageToken) loadFiles({ append: true });
  });
  if (el.selectionModeButton) el.selectionModeButton.addEventListener('click', () => enterSelectionMode());
  if (el.selectionCancelBtn) el.selectionCancelBtn.addEventListener('click', exitSelectionMode);
  if (el.selectionSelectAllBtn) el.selectionSelectAllBtn.addEventListener('click', selectAllVisibleFiles);
  if (el.selectionDeleteBtn) el.selectionDeleteBtn.addEventListener('click', requestDeleteFile);
  if (el.selectionMoveBtn) el.selectionMoveBtn.addEventListener('click', requestMoveFile);
  if (el.folderMoreButton) el.folderMoreButton.addEventListener('click', () => {
    state.folderRenderLimit += FOLDER_RENDER_MAX;
    renderFiles();
  });
  if (el.closePlayerButton) el.closePlayerButton.addEventListener('click', closePlayer);
  if (el.playerBackdrop) el.playerBackdrop.addEventListener('click', closePlayer);
  if (el.fullscreenButton) el.fullscreenButton.addEventListener('click', toggleFullscreen);
  if (el.pipButton) el.pipButton.addEventListener('click', togglePictureInPicture);

  // Topbar and Controls Navigation Buttons (Robust Click Binding & Timer Resets)
  if (el.topbarPrevBtn) {
    el.topbarPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playPrevFile('right');
    });
  }
  if (el.topbarRandomBtn) {
    el.topbarRandomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playRandomFile('up');
    });
  }
  if (el.topbarNextBtn) {
    el.topbarNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playNextFile('left');
    });
  }
  if (el.ctrlPrevVideo) {
    el.ctrlPrevVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playPrevFile('right');
    });
  }
  if (el.ctrlRandomShorts) {
    el.ctrlRandomShorts.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playRandomFile('up');
    });
  }
  if (el.ctrlNextVideo) {
    el.ctrlNextVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playNextFile('left');
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  el.mediaStage.addEventListener('dblclick', (event) => {
    if (event.target.tagName !== 'BUTTON' && !event.target.closest('.custom-video-controls')) {
      toggleFullscreen();
    }
  });
  el.mediaStage.addEventListener('click', onMediaStageClick);
  el.mediaStage.addEventListener('pointermove', resetControlsTimer);
  el.mediaStage.addEventListener('pointerdown', resetControlsTimer);
  document.addEventListener('keydown', handlePlayerKeyboard);

  // Custom Video Controls Event Listeners
  if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.addEventListener('click', togglePlayPause);
  if (el.ctrlPlayPause) el.ctrlPlayPause.addEventListener('click', togglePlayPause);
  if (el.ctrlRewind) el.ctrlRewind.addEventListener('click', () => seekRelative(-10));
  if (el.ctrlFramePrev) el.ctrlFramePrev.addEventListener('click', () => stepVideoFrame(-1));
  if (el.ctrlFrameNext) el.ctrlFrameNext.addEventListener('click', () => stepVideoFrame(1));
  if (el.shortsFramePrev) el.shortsFramePrev.addEventListener('click', () => stepVideoFrame(-1));
  if (el.shortsFrameNext) el.shortsFrameNext.addEventListener('click', () => stepVideoFrame(1));
  if (el.ctrlForward) el.ctrlForward.addEventListener('click', () => seekRelative(10));
  if (el.ctrlMute) el.ctrlMute.addEventListener('click', toggleMute);
  if (el.ctrlVolumeSlider) el.ctrlVolumeSlider.addEventListener('input', onVolumeSliderInput);
  if (el.ctrlSpeedButton) el.ctrlSpeedButton.addEventListener('click', toggleSpeedMenu);
  if (el.ctrlPip) el.ctrlPip.addEventListener('click', togglePictureInPicture);
  if (el.ctrlFullscreen) el.ctrlFullscreen.addEventListener('click', toggleFullscreen);
  [el.topbarFavoriteBtn, el.ctrlFavorite, el.shortsFavoriteBtn].forEach((button) => {
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavoriteForSelected({ showFeedback: true });
    });
  });
  if (el.playerMoreMenu) el.playerMoreMenu.addEventListener('toggle', () => {
    isPlayerMoreOpen = el.playerMoreMenu.open;
    resetControlsTimer();
  });
  if (el.speedButtons) {
    el.speedButtons.forEach((btn) => {
      btn.addEventListener('click', () => setPlaybackSpeed(Number(btn.dataset.speed)));
      btn.addEventListener('keydown', onSpeedMenuKeyDown);
    });
  }
  if (el.seekBarContainer) {
    el.seekBarContainer.addEventListener('pointerdown', onSeekPointerDown);
    el.seekBarContainer.addEventListener('pointermove', onSeekPointerHover);
    el.seekBarContainer.addEventListener('pointerleave', onSeekPointerLeave);
    el.seekBarContainer.addEventListener('keydown', onSeekKeyDown);
  }
  if (el.mobileShortsProgressTrack) {
    el.mobileShortsProgressTrack.addEventListener('pointerdown', onShortsProgressPointerDown);
  }
  document.addEventListener('click', onDocumentClickForSpeedMenu);

  el.bannerUpdateButton.addEventListener('click', applyAppUpdate);
  el.closeBannerButton.addEventListener('click', () => { el.updateBanner.hidden = true; });
  el.checkUpdateButton.addEventListener('click', () => checkForAppUpdate({ manual: true }));
  el.applyUpdateButton.addEventListener('click', applyAppUpdate);
  el.forceReloadButton.addEventListener('click', forceReloadApp);

  el.retryMediaButton.addEventListener('click', retryMedia);
  el.bufferOriginalButton.addEventListener('click', confirmPendingMediaAction);
  el.compatPlayerButton.addEventListener('click', () => {
    if (state.selected) showDrivePreview(state.selected, '원본 임시 저장 대신');
  });
  el.openDriveButton.addEventListener('click', openSelectedInDrive);
  el.drivePreviewRetryButton.addEventListener('click', retryMedia);
  el.drivePreviewOpenButton.addEventListener('click', openSelectedInDrive);
  el.saveSettingsButton.addEventListener('click', saveSettings);
  el.settingsClientId.addEventListener('input', clearSettingsClientIdError);
  el.disconnectButton.addEventListener('click', disconnect);
  el.copyOriginButton.addEventListener('click', copyOrigin);

  // Folder navigation
  if (el.folderUpButton) el.folderUpButton.addEventListener('click', navigateToParentFolder);

  // Delete flow (desktop topbar, desktop controls, mobile shorts chips)
  [el.topbarDeleteBtn, el.ctrlDelete, el.shortsDeleteBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      flashPressed(btn);
      if (el.playerMoreMenu) el.playerMoreMenu.open = false;
      requestDeleteFile();
    });
  });
  // Move flow (desktop topbar, desktop controls, mobile shorts chips)
  [el.topbarMoveBtn, el.ctrlMove, el.shortsMoveBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      flashPressed(btn);
      if (el.playerMoreMenu) el.playerMoreMenu.open = false;
      requestMoveFile();
    });
  });
  if (el.shortsRotateBtn) el.shortsRotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVideoRotation();
  });
  if (el.shortsDriveBtn) el.shortsDriveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSelectedInDrive();
  });
  if (el.shortsPipBtn) el.shortsPipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePictureInPicture();
  });
  if (el.shortsFullscreenBtn) el.shortsFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
  if (el.shortsMoreBtn) el.shortsMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleShortsExpand();
  });
  if (el.deepScanToggle) el.deepScanToggle.addEventListener('click', toggleDeepScan);
  if (el.deepScanStopBtn) el.deepScanStopBtn.addEventListener('click', () => {
    flashPressed(el.deepScanStopBtn);
    if (state.treeAbort) state.treeAbort.abort();
  });

  // Delete confirm dialog
  if (el.deleteCancelButton) el.deleteCancelButton.addEventListener('click', () => {
    flashPressed(el.deleteCancelButton);
    state.pendingActionFiles = [];
    el.deleteDialog.close();
  });
  if (el.deleteConfirmButton) el.deleteConfirmButton.addEventListener('click', performDeleteFile);
  if (el.deleteDialog) el.deleteDialog.addEventListener('cancel', (event) => {
    if (state.deleting || state.bulkAction) event.preventDefault();
    else state.pendingActionFiles = [];
  });

  // Move dialog
  if (el.moveCancelButton) el.moveCancelButton.addEventListener('click', () => {
    flashPressed(el.moveCancelButton);
    cancelMoveFolderLoading();
    el.moveDialog.close();
  });
  if (el.moveConfirmButton) el.moveConfirmButton.addEventListener('click', performMoveFile);
  if (el.moveDialog) el.moveDialog.addEventListener('cancel', (event) => {
    if (state.moving || state.bulkAction) event.preventDefault();
    else cancelMoveFolderLoading();
  });
  if (el.moveDialog) el.moveDialog.addEventListener('close', () => {
    if (!state.moving && !state.bulkAction) cancelMoveFolderLoading();
  });
  if (el.moveSearchInput) el.moveSearchInput.addEventListener('input', (event) => {
    state.moveResultLimit = MOVE_RESULT_BATCH;
    renderMoveFolderList(event.target.value);
  });

  // Permission guide dialog
  if (el.permissionCloseButton) el.permissionCloseButton.addEventListener('click', () => el.permissionDialog.close());
  if (el.permissionReconnectButton) el.permissionReconnectButton.addEventListener('click', () => {
    el.permissionDialog.close();
    state.retryAfterAuth = false;
    state.authRetryContext = null;
    clearToken(false);
    state.tokenClient = null;
    requestAccessToken();
  });
  [el.settingsDialog, el.deleteDialog, el.moveDialog, el.permissionDialog].forEach((dialog) => bindDialogLightDismiss(dialog));
  window.addEventListener('online', updateConnectionBadge);
  window.addEventListener('offline', updateConnectionBadge);
  window.addEventListener('scroll', () => {
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.classList.toggle('nav-scrolled', window.scrollY > 20);
    }
    scheduleRenderWindowUpdate();
  }, { passive: true });
  window.addEventListener('resize', scheduleRenderWindowUpdate, { passive: true });
  const onPlayerUserActivity = () => {
    if (!el.playerSheet || el.playerSheet.hidden) return;
    if (el.playerModal) el.playerModal.classList.remove('controls-idle');
    resetControlsTimer();
  };
  window.addEventListener('mousemove', onPlayerUserActivity, { passive: true });
  window.addEventListener('pointermove', onPlayerUserActivity, { passive: true });
  window.addEventListener('keydown', (e) => {
    if (!el.playerSheet || el.playerSheet.hidden) return;
    if (el.playerModal) el.playerModal.classList.remove('controls-idle');
    resetControlsTimer();
  }, { passive: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendTokenToWorker();
      checkForAppUpdate({ manual: false });
      if (hasUsableToken()) {
        initializeAccountMediaState({ refresh: true }).then(() => {
          if (state.filter === 'favorites') loadFavoriteFiles({ refreshState: false });
        }).catch((error) => console.warn('Account media state refresh was unavailable:', error));
      }
      // 모바일 백그라운드 복귀 시 setTimeout 타이머가 정지되어
      // 토큰 갱신이 누락될 수 있으므로 즉시 검사·보정한다.
      if (state.token && state.expiresAt) {
        const remaining = state.expiresAt - Date.now();
        if (remaining <= 0) {
          // 이미 만료 — 즉시 갱신 시도
          clearToken(false);
          if (state.clientId && validateClientId(state.clientId)) {
            attemptSilentAutoLogin({ background: true });
          }
        } else if (remaining < 5 * 60 * 1000) {
          // 5분 이내 만료 — 즉시 갱신
          attemptSilentAutoLogin({ background: true });
        } else {
          // 타이머가 드리프트됐을 수 있으므로 재스케줄
          scheduleTokenRenewal();
        }
      }
    }
  });

  el.videoPlayer.addEventListener('loadedmetadata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    state.mediaDecodeVerified = true;
    updateVideoProgress();
    updatePlayPauseUI();
    beginVideoFrameSampling();
  });
  el.videoPlayer.addEventListener('canplay', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onMediaReady();
  });
  el.videoPlayer.addEventListener('playing', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onMediaReady();
  });
  el.videoPlayer.addEventListener('timeupdate', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onVideoTimeUpdate();
  });
  el.videoPlayer.addEventListener('progress', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onVideoProgressUpdate();
  });
  el.videoPlayer.addEventListener('play', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    updatePlayPauseUI();
    beginVideoFrameSampling();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('pause', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    updatePlayPauseUI();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('volumechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateVolumeUI();
  });
  el.videoPlayer.addEventListener('ratechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateSpeedUI();
  });
  el.videoPlayer.addEventListener('resize', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateQualityDisplay();
  });
  el.videoPlayer.addEventListener('error', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) handleMediaElementError('video');
  });
  el.videoPlayer.addEventListener('loadeddata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    scheduleVideoFramePresentation(event.currentTarget, state.mediaSession);
  });
  el.imageViewer.addEventListener('load', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    if (!el.ambientBackdrop?.classList.contains('active') && el.imageViewer.src) {
      el.ambientBackdrop.style.backgroundImage = `url("${el.imageViewer.src}")`;
      el.ambientBackdrop.classList.add('active');
    }
    onMediaReady();
  });
  el.imageViewer.addEventListener('error', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) handleMediaElementError('image');
  });
  el.drivePreview.addEventListener('load', handleDrivePreviewLoad);
  el.drivePreview.addEventListener('error', handleDrivePreviewFailure);
}

async function setupServiceWorker() {
  if (location.protocol === 'file:') {
    if (!state.demo) {
      setClientIdError('압축을 푼 파일을 직접 열면 스트리밍할 수 없습니다. HTTPS 주소에 배포한 뒤 사용하세요.');
    }
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    showToast('HTTPS 환경이 아니어서 원본 스트리밍 기능을 시작할 수 없습니다.');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    state.serviceWorkerRegistration = registration;
    await navigator.serviceWorker.ready;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updatePending) {
        window.location.reload();
      } else {
        sendTokenToWorker();
      }
    });

    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    sendTokenToWorker();
    setInterval(sendTokenToWorker, 20_000);

    // Initial check after 2 seconds, then every 5 minutes
    setTimeout(() => checkForAppUpdate({ manual: false }), 2000);
    setInterval(() => checkForAppUpdate({ manual: false }), 5 * 60 * 1000);
  } catch (error) {
    console.error('Service worker registration failed', error);
  }
}

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  if (remote === local) return false;
  const cleanR = remote.replace(/^[^\d]*/, '').split('.').map(Number);
  const cleanL = local.replace(/^[^\d]*/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(cleanR.length, cleanL.length); i++) {
    const r = cleanR[i] || 0;
    const l = cleanL[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
  }
  return false;
}

function notifyUpdateAvailable(newVersion, summary) {
  const verStr = newVersion ? `v${newVersion}` : '새 버전';
  if (el.updateBanner) {
    el.updateBanner.hidden = false;
    if (el.updateBannerText) {
      el.updateBannerText.textContent = summary
        ? `${verStr}: ${summary}`
        : `새로운 앱 버전(${verStr})이 준비되었습니다. 최신 기능을 적용하세요.`;
    }
  }
  if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = false;
  if (el.applyUpdateButton) {
    el.applyUpdateButton.hidden = false;
    el.applyUpdateButton.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${verStr} 지금 업데이트 적용</span>`;
  }
  if (el.updateStatusText) {
    el.updateStatusText.textContent = `${verStr} 업데이트가 준비되었습니다. 지금 적용하세요.`;
  }
}

async function checkForAppUpdate({ manual = false } = {}) {
  if (manual && el.updateStatusText) {
    el.updateStatusText.textContent = '최신 버전 확인 중…';
    if (el.checkUpdateButton) el.checkUpdateButton.disabled = true;
  }

  let remoteVersion = null;
  let releaseInfo = null;

  try {
    // Fetch remote version metadata directly from server (bypassing all caches)
    const versionUrl = new URL(`version.json?_t=${Date.now()}`, location.href).href;
    const res = await fetch(versionUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
    });

    if (res.ok) {
      releaseInfo = await res.json();
      remoteVersion = releaseInfo.version;
    }

    if ('serviceWorker' in navigator && state.serviceWorkerRegistration) {
      await state.serviceWorkerRegistration.update().catch(() => {});
    }

    const hasNewVersion = Boolean(remoteVersion && isNewerVersion(remoteVersion, APP_VERSION));

    if (hasNewVersion) {
      notifyUpdateAvailable(remoteVersion, releaseInfo?.changeSummary);
      if (manual) {
        showToast(`새로운 버전(v${remoteVersion})이 준비되었습니다. [지금 업데이트]를 눌러 적용하세요.`);
      }
      return { hasUpdate: true, version: remoteVersion };
    }

    // No new update -> strictly hide all update indicators
    if (el.updateBanner) el.updateBanner.hidden = true;
    if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = true;
    if (el.applyUpdateButton) el.applyUpdateButton.hidden = true;

    if (manual) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      if (el.updateStatusText) {
        el.updateStatusText.textContent = `현재 최신 버전(v${APP_VERSION})을 사용 중입니다. (${timeStr} 확인)`;
      }
      showToast(`현재 최신 버전(v${APP_VERSION})입니다.`);
    }
    return { hasUpdate: false, version: APP_VERSION };
  } catch (err) {
    console.error('Update check failed:', err);
    if (manual) {
      if (el.updateStatusText) el.updateStatusText.textContent = '업데이트 확인 중 오류가 발생했습니다.';
      showToast('업데이트 확인 실패: 네트워크를 확인하세요.');
    }
    return { hasUpdate: false, error: err };
  } finally {
    if (manual && el.checkUpdateButton) el.checkUpdateButton.disabled = false;
  }
}

async function applyAppUpdate() {
  updatePending = true;
  showToast('최신 버전을 즉시 적용합니다…');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (_) {}

  // Force a hard network reload bypassing browser HTTP disk cache
  const target = new URL(location.href);
  target.searchParams.set('_update', Date.now().toString());
  location.replace(target.href);
}

async function forceReloadApp() {
  showToast('캐시를 삭제하고 앱을 새로고침합니다…');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    console.error('Force clear error', e);
  }
  window.location.reload(true);
}

async function handleWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'TOKEN_REQUEST' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    let available = hasUsableToken();
    if (data.forceRefresh && state.clientId && validateClientId(state.clientId)) {
      available = await requestGoogleToken({ background: true, force: true });
    }
    port.postMessage({
      type: 'TOKEN_RESPONSE',
      requestId: data.requestId,
      token: available && hasUsableToken() ? state.token : null,
      expiresAt: available && hasUsableToken() ? state.expiresAt : 0
    });
    port.close?.();
    return;
  }
  if (data.type === 'MEDIA_PROXY_STATUS') {
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    if (data.fileId && data.fileId !== state.selected?.id) return;
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    if (!state.selected || state.mediaPlaybackMode === PLAYBACK_MODE.COMPATIBILITY) return;
    const requestedRange = String(data.requestedRange || '');
    const contentRange = String(data.contentRange || '');
    const rangeSatisfied = data.rangeSatisfied === true;
    const status = Number(data.status) || 0;
    if (data.playbackMode === PLAYBACK_MODE.SEQUENTIAL || (requestedRange && status === 200)) {
      state.mediaPlaybackMode = PLAYBACK_MODE.SEQUENTIAL;
      state.mediaRangeIntegrity = 'sequential';
      state.mediaTransportVerified = true;
    } else if (data.playbackMode === PLAYBACK_MODE.RANGE || (status === 206 && rangeSatisfied && contentRange)) {
      state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
      state.mediaRangeIntegrity = 'valid';
      state.mediaTransportVerified = true;
    }
    if (state.mediaTransportVerified && el.codecNote) {
      el.codecNote.textContent = state.mediaPlaybackMode === PLAYBACK_MODE.SEQUENTIAL
        ? 'Google Drive 원본 파일 바이트를 재인코딩 없이 연속 전송 중입니다.'
        : 'Google Drive 원본 파일 바이트를 Range로 재인코딩 없이 전송 중입니다.';
    }
    state.lastProxyError = null;
    updateQualityDisplay();
    return;
  }
  if (data.type === 'MEDIA_PROXY_ERROR') {
    if (data.fileId && data.fileId !== state.selected?.id) return;
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    state.lastProxyError = data;
    if (!state.selected) return;
    if (state.mediaAttempt.startsWith('drive-preview')) return;
    if (['auth-refresh', 'retry-wait', 'blob-loading', 'buffer-evaluating', 'buffer-choice'].includes(state.mediaAttempt)) return;
    await recoverFromMediaProxyError(data);
  }
}

async function recoverFromMediaProxyError(data) {
  const retryFile = state.selected;
  if (!retryFile) return;
  const retrySession = state.mediaSession;
  const isVideo = retryFile.mimeType?.startsWith('video/');
  if (isDriveSecurityRestriction(data) && !state.mediaAbuseAcknowledged) {
    state.mediaAttempt = 'security-confirmation';
    state.pendingSecurityConfirmation = { fileId: retryFile.id, session: retrySession, stage: 'range' };
    showMediaError(
      'Google Drive가 이 파일을 악성코드·바이러스 또는 악용 가능성이 있는 파일로 표시했습니다. 위험을 이해하고 직접 선택한 경우에만 원본 다운로드를 다시 시도합니다.',
      { title: '보안 경고가 있는 원본 파일', showRetry: false }
    );
    el.bufferOriginalButton.textContent = '위험을 이해하고 원본 재시도';
    el.bufferOriginalButton.hidden = false;
    return;
  }
  const cause = classifyMediaProxyFailure(data);
  const action = decideMediaRecovery({
    cause,
    isVideo,
    downloadAllowed: retryFile.capabilities?.canDownload !== false,
    rangeRetryCount: state.mediaRetryCount,
    rangeRebuildCount: state.mediaRangeRebuildCount,
    permissionRetryCount: state.mediaPermissionRetryCount
  });

  if (action === 'refresh-auth' || action === 'refresh-permission') {
    const snapshot = capturePlaybackSnapshot();
    if (snapshot) state.resumePosition = { fileId: retryFile.id, time: snapshot.time, snapshot };
    state.retryAfterAuth = true;
    state.authRetryContext = { fileId: retryFile.id, mediaSession: retrySession };
    state.mediaAttempt = 'auth-refresh';
    if (action === 'refresh-permission') state.mediaPermissionRetryCount += 1;
    showMediaLoading(action === 'refresh-auth'
      ? 'Google 연결을 안전하게 갱신하는 중'
      : 'Drive 원본 권한을 다시 확인하는 중');
    const refreshed = state.clientId && validateClientId(state.clientId)
      ? await requestGoogleToken({ background: true, force: true })
      : false;
    if (state.selected?.id !== retryFile.id || state.mediaSession !== retrySession) return;
    if (refreshed) {
      state.retryAfterAuth = false;
      state.authRetryContext = null;
      if (!retryOriginalStream(retryFile, retrySession, '연결 확인 완료 — 원본 스트림 다시 연결 중')) {
        await offerOriginalBufferFallback(retryFile, isVideo ? 'video' : 'image', retrySession, '원본 연결을 복구하지 못해');
      }
    } else {
      state.mediaAttempt = 'failed';
      showMediaError('Google 연결을 다시 확인해야 합니다. 아래 다시 시도를 눌러 계정 연결을 갱신하세요.', {
        title: 'Google Drive 재연결 필요'
      });
    }
    updateConnectionBadge();
    return;
  }

  if (action === 'fail-not-found') {
    state.mediaAttempt = 'failed';
    showMediaError('파일이 이동 또는 삭제되었거나 현재 계정에서 더 이상 볼 수 없습니다.', {
      title: '파일을 찾을 수 없습니다'
    });
    return;
  }

  if (action === 'fail-permission') {
    clearToken(true);
    state.mediaAttempt = 'failed';
    showMediaError(
      '현재 Google 계정 또는 OAuth 권한으로는 원본 파일을 읽을 수 없습니다. 다시 시도를 눌러 계정 권한을 직접 확인해 주세요.',
      { title: 'Google Drive 권한 확인 필요' }
    );
    updateConnectionBadge();
    return;
  }

  if (action === 'compatibility') {
    showDrivePreview(retryFile, cause === 'permission'
      ? '원본 다운로드 권한이 제한되어'
      : '원본 재생 경로를 사용할 수 없어');
    return;
  }

  if (action === 'rebuild-range') {
    state.mediaRangeRebuildCount += 1;
    const currentSize = getUnsatisfiedRangeSize(data.contentRange);
    if (currentSize != null) retryFile.size = String(currentSize);
  }
  if (action === 'retry-range' || action === 'rebuild-range') {
    const requestedDelay = Math.max(0, Number(data.retryAfterMs) || 0);
    const retryDelay = Math.max(250, Math.min(MAX_ORIGINAL_RETRY_AFTER_MS, requestedDelay || 700));
    const message = cause === 'range-416'
      ? '원본 파일 범위를 다시 확인해 스트림을 재구성하는 중'
      : cause === 'rate-limit'
        ? 'Drive 요청을 잠시 쉬었다가 원본으로 다시 연결합니다'
        : 'Drive 원본 스트림에 다시 연결하는 중';
    scheduleOriginalStreamRetry(retryFile, retrySession, retryDelay, message);
    return;
  }

  state.mediaAttempt = 'buffer-evaluating';
  await offerOriginalBufferFallback(
    retryFile,
    isVideo ? 'video' : 'image',
    retrySession,
    cause === 'range-416'
      ? '원본 파일 범위가 변경되어'
      : '원본 구간 스트림을 안정적으로 이어가지 못해'
  );
}

function sendTokenToWorker() {
  if (!hasUsableToken()) return;
  const message = { type: 'SET_TOKEN', token: state.token, expiresAt: state.expiresAt };
  if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(message);
  const registration = state.serviceWorkerRegistration;
  [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
}

function saveToken(token, expiresAt) {
  state.token = token;
  state.expiresAt = expiresAt;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch (_) {}
  scheduleTokenRenewal();
}

function loadSavedToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.token && typeof data.expiresAt === 'number') {
      if (Date.now() < data.expiresAt - TOKEN_SKEW_MS) {
        state.token = data.token;
        state.expiresAt = data.expiresAt;
        scheduleTokenRenewal();
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function scheduleTokenRenewal() {
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  if (!state.token || !state.expiresAt) return;
  // 1차: 만료 10분 전에 갱신하고, 실패하면 만료 3분 전에 한 번 더 시도한다.
  const remainingMs = state.expiresAt - Date.now();
  const firstTryMs = Math.max(10_000, remainingMs - (10 * 60 * 1000));
  tokenRenewalTimer = setTimeout(async () => {
    if (!state.clientId || !validateClientId(state.clientId)) return;
    const expiresAtBeforeAttempt = state.expiresAt;
    const refreshed = await requestGoogleToken({ background: true, force: true });
    if (refreshed || state.expiresAt !== expiresAtBeforeAttempt) return;
    const secondRemaining = expiresAtBeforeAttempt - Date.now();
    if (secondRemaining <= 0) return;
    tokenRenewalTimer = setTimeout(() => {
      requestGoogleToken({ background: true, force: true });
    }, Math.max(5_000, secondRemaining - (3 * 60 * 1000)));
  }, firstTryMs);
}

function beginAuthorization() {
  if (!validateClientId(state.clientId)) {
    setClientIdError('OAuth 연결 설정을 확인해 주세요. 자체 배포 중이라면 고급 설정에서 클라이언트 ID를 저장하세요.');
    return;
  }
  clearClientIdError();
  requestAccessToken();
}

async function requestAccessToken() {
  return requestGoogleToken({ background: false, force: true, invalidateSession: true });
}

async function attemptSilentAutoLogin({ background = false } = {}) {
  if (!state.clientId || !validateClientId(state.clientId)) {
    if (!background) showSetup();
    return;
  }
  const connected = await requestGoogleToken({ background, force: true, invalidateSession: !background });
  if (!connected && !background) showSetup();
  return connected;
}

async function applyTokenResponse(response, { background, invalidateSession, generation }) {
  if (generation !== state.authGeneration) return false;
  if (!response || response.error || !response.access_token) {
    updateConnectionBadge();
    if (!background && response?.error !== 'user_cancelled') {
      setClientIdError(response?.error_description || 'Google 인증이 완료되지 않았습니다.');
    }
    return false;
  }
  const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
  saveToken(response.access_token, Date.now() + expiresIn * 1000);
  clearClientIdError();
  sendTokenToWorker();
  if (invalidateSession) invalidateDriveSessionData();
  updateConnectionBadge();
  setTimeout(async () => {
    if (generation !== state.authGeneration) return;
    if (!state.accountStateLoaded) {
      await initializeAccountMediaState().catch((error) => {
        console.warn('Account media state sync was unavailable:', error);
      });
    }
    const retryContext = state.authRetryContext;
    if (
      state.retryAfterAuth && retryContext && state.selected?.id === retryContext.fileId
      && state.mediaSession === retryContext.mediaSession
    ) {
      const retryFile = state.selected;
      state.retryAfterAuth = false;
      state.authRetryContext = null;
      state.pendingPlay = state.resumePosition?.snapshot
        ? !state.resumePosition.snapshot.paused
        : true;
      openMediaSource(retryFile);
    } else if (state.retryAfterAuth) {
      state.retryAfterAuth = false;
      state.authRetryContext = null;
    } else if (!state.files.length) {
      loadFiles({ append: false });
    }
  }, 0);
  return true;
}

function requestGoogleToken({ background = false, force = false, invalidateSession = false } = {}) {
  if (!force && hasUsableToken()) return Promise.resolve(true);
  const generation = state.authGeneration;
  if (tokenRequestPromise) {
    const sameGeneration = tokenRequestGeneration === generation;
    const existingRequestCoversThisOne = !tokenRequestBackground || background;
    if (sameGeneration && existingRequestCoversThisOne) return tokenRequestPromise;
    const priorRequest = tokenRequestPromise;
    return priorRequest.catch(() => false).then((connected) => {
      if (generation !== state.authGeneration) return false;
      if (connected && hasUsableToken()) return true;
      return requestGoogleToken({ background, force, invalidateSession });
    });
  }
  if (!background) {
    setConnectBusy(true);
    updateConnectionBadge('busy');
  }

  const operation = (async () => {
    try {
      await waitForGoogleIdentity(background ? 5_000 : 12_000);
      if (generation !== state.authGeneration) return false;
      return await new Promise((resolve) => {
        let settled = false;
        const finish = (result) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          if (pendingTokenRequest?.generation === generation) pendingTokenRequest = null;
          resolve(Boolean(result));
        };
        const client = google.accounts.oauth2.initTokenClient({
          client_id: state.clientId,
          scope: DRIVE_SCOPE,
          callback: async (response) => finish(await applyTokenResponse(response, {
            background, invalidateSession, generation
          })),
          error_callback: (error) => {
            console.warn('Google OAuth request did not complete:', error);
            if (!background) {
              const message = error?.type === 'popup_failed_to_open'
                ? 'Google 로그인 창이 차단되었습니다. 브라우저의 팝업 허용 설정을 확인하세요.'
                : 'Google 로그인을 완료하지 못했습니다. 다시 연결해 주세요.';
              showToast(message);
            }
            finish(false);
          }
        });
        state.tokenClient = client;
        const timeout = setTimeout(() => finish(false), background ? 10_500 : 20_000);
        pendingTokenRequest = { generation, finish };
        client.requestAccessToken({ prompt: '' });
      });
    } catch (error) {
      console.error('Google Identity request failed:', error);
      if (!background) setClientIdError('Google 인증 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
      return false;
    } finally {
      if (!background) setConnectBusy(false);
      updateConnectionBadge();
    }
  })();

  tokenRequestPromise = operation;
  tokenRequestGeneration = generation;
  tokenRequestBackground = background;
  operation.finally(() => {
    if (tokenRequestPromise === operation) {
      tokenRequestPromise = null;
      tokenRequestGeneration = -1;
      tokenRequestBackground = true;
    }
  });
  return operation;
}

function waitForGoogleIdentity(timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('Google Identity Services timeout'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

let infiniteScrollObserver = null;
const generatedThumbnailCache = new Map();

function setupInfiniteScroll() {
  if (infiniteScrollObserver) {
    infiniteScrollObserver.disconnect();
  }
  if (!el.infiniteScrollSentinel) return;

  infiniteScrollObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting) {
      if (state.nextPageToken && !state.loadingFiles) {
        loadFiles({ append: true });
      }
    }
  }, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0
  });

  infiniteScrollObserver.observe(el.infiniteScrollSentinel);
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

function processThumbnailQueue() {
  if (playerMediaPriorityActive) return;
  if (activeThumbnailExtractions >= MAX_CONCURRENT_EXTRACTIONS || thumbnailExtractionQueue.length === 0) {
    return;
  }

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
      console.warn('Canvas frame capture warning:', err);
    }
    finish();
  };

  video.addEventListener('loadeddata', capture);
  video.addEventListener('seeked', capture);
  video.addEventListener('error', () => finish(), { once: true });
  timeout = setTimeout(() => finish(), 4000);
}

async function loadFiles({ append }) {
  if (state.demo) {
    startDemoMode();
    return true;
  }
  if (append && state.listRequestPromise) return state.listRequestPromise;
  if (!hasUsableToken()) {
    showSetup();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return false;
  }

  if (!append) resetListingSession();
  const generation = state.listGeneration;
  const controller = state.listAbortController;
  state.loadingFiles = true;
  showLibrary();
  if (!append) el.libraryStatus.textContent = 'Drive에서 폴더와 원본 파일 목록을 불러오는 중…';
  el.refreshButton.disabled = true;
  if (el.infiniteScrollSpinner) el.infiniteScrollSpinner.hidden = false;

  const parentClause = state.currentFolderId === 'root'
    ? `'root' in parents`
    : `'${state.currentFolderId}' in parents`;
  const params = new URLSearchParams({
    pageSize: String(DRIVE_PAGE_SIZE),
    orderBy: 'folder,modifiedTime desc',
    q: `trashed = false and ${parentClause} and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/' or mimeType contains 'image/')`,
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,parents,driveId,capabilities(canDownload,canDelete,canMoveItemOutOfDrive,canMoveItemWithinDrive),videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
  });
  if (append && state.nextPageToken) params.set('pageToken', state.nextPageToken);

  const request = (async () => {
   try {
    const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal });
    const data = await response.json();
    if (generation !== state.listGeneration || controller.signal.aborted) return false;
    const incoming = Array.isArray(data.files) ? data.files : [];
    const incomingFolders = incoming.filter((f) => f.mimeType === FOLDER_MIME);
    const incomingMedia = incoming.filter((f) => f.mimeType?.startsWith('video/') || f.mimeType?.startsWith('image/'));

    if (append) {
      state.files = dedupeFiles([...state.files, ...incomingMedia]);
      state.folders = dedupeFiles([...state.folders, ...incomingFolders]);
    } else {
      state.files = incomingMedia;
      state.folders = incomingFolders;
    }
    state.nextPageToken = data.nextPageToken || null;
    state.populationComplete = !state.nextPageToken;
    renderFiles({ resetWindow: !append });
    el.libraryStatus.textContent = '';
    return true;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.listGeneration) {
      return false;
    }
    console.error(error);
    el.libraryStatus.textContent = `파일 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    if (error.status === 401) {
      clearToken(false);
      if (state.clientId && validateClientId(state.clientId)) {
        attemptSilentAutoLogin({ background: true });
      } else {
        showSetup();
      }
    }
    return false;
  } finally {
    if (generation === state.listGeneration) {
      state.loadingFiles = false;
      el.refreshButton.disabled = false;
      if (el.infiniteScrollSpinner) el.infiniteScrollSpinner.hidden = !state.nextPageToken;
      updateLibrarySummary();
      updateConnectionBadge();
    }
  }
  })();
  state.listRequestPromise = request;
  try {
    return await request;
  } finally {
    if (state.listRequestPromise === request) state.listRequestPromise = null;
  }
}

function resetListingSession() {
  state.listAbortController?.abort();
  state.listGeneration++;
  state.listAbortController = new AbortController();
  state.listRequestPromise = null;
  state.populationLoadPromise = null;
  state.populationComplete = false;
  state.loadingFiles = false;
  state.files = [];
  state.folders = [];
  state.nextPageToken = null;
  state.renderWindowStart = 0;
  state.renderRowHeight = 250;
  state.folderRenderLimit = FOLDER_RENDER_MAX;
  state.randomRequestGeneration++;
  shuffledOrderMap.clear();
  thumbnailGeneration++;
  gifThumbnailObserver?.disconnect();
  gifThumbnailObserver = null;
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
  if (!folderId) return;
  if (folderId === state.currentFolderId) return;
  // The breadcrumb always renders root as the first crumb; keep it out of the stack.
  if (state.currentFolderId !== 'root') {
    state.folderStack.push({ id: state.currentFolderId, name: state.currentFolderName });
  }
  state.currentFolderId = folderId;
  state.currentFolderName = folderName || '폴더';
  resetListingSession();
  scrollToLibraryTop();
  animateFolderTransition('forward');
  applyFolderView();
}

function navigateToFolderIndex(index) {
  const crumbs = [{ id: 'root', name: '내 드라이브' }, ...state.folderStack, { id: state.currentFolderId, name: state.currentFolderName }];
  const target = crumbs[index];
  if (!target || target.id === state.currentFolderId) return;
  state.folderStack = crumbs.slice(1, index);
  state.currentFolderId = target.id;
  state.currentFolderName = target.name;
  resetListingSession();
  scrollToLibraryTop();
  animateFolderTransition('back');
  applyFolderView();
}

function navigateToParentFolder() {
  if (!state.folderStack.length && state.currentFolderId === 'root') return;
  const parent = state.folderStack.length
    ? state.folderStack.pop()
    : { id: 'root', name: '내 드라이브' };
  state.currentFolderId = parent.id;
  state.currentFolderName = parent.name;
  resetListingSession();
  scrollToLibraryTop();
  animateFolderTransition('back');
  applyFolderView();
}

function canNavigateLibraryBack() {
  return state.filter === 'favorites' || state.currentFolderId !== 'root' || state.folderStack.length > 0;
}

function clearLibraryEdgeBackVisuals() {
  if (el.libraryView) {
    el.libraryView.style.transform = '';
    el.libraryView.style.opacity = '';
    el.libraryView.style.willChange = '';
  }
  if (el.edgeBackIndicator) {
    el.edgeBackIndicator.hidden = true;
    el.edgeBackIndicator.style.transform = '';
    el.edgeBackIndicator.style.opacity = '';
  }
}

function completeLibraryBackNavigation() {
  clearLibraryEdgeBackVisuals();
  if (state.filter === 'favorites') setLibraryFilter('all');
  else navigateToParentFolder();
}

function settleLibraryEdgeBack(commit) {
  const view = el.libraryView;
  const indicator = el.edgeBackIndicator;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!commit || reduced || typeof view?.animate !== 'function') {
    if (commit) completeLibraryBackNavigation();
    else clearLibraryEdgeBackVisuals();
    return;
  }
  const width = Math.max(320, window.innerWidth || view.clientWidth || 400);
  const viewAnimation = view.animate([
    { transform: view.style.transform || 'translate3d(0,0,0)', opacity: Number(view.style.opacity || 1) },
    { transform: `translate3d(${Math.min(96, width * 0.22)}px,0,0)`, opacity: 0.82 }
  ], { duration: 150, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
  if (indicator && typeof indicator.animate === 'function') {
    indicator.animate([
      { transform: indicator.style.transform || 'translate3d(0, -50%, 0) scale(1)', opacity: 1 },
      { transform: 'translate3d(18px, -50%, 0) scale(1.04)', opacity: 0 }
    ], { duration: 150, easing: 'cubic-bezier(0.32, 0.72, 0, 1)', fill: 'forwards' });
  }
  viewAnimation.finished.catch(() => {}).finally(() => {
    viewAnimation.cancel?.();
    completeLibraryBackNavigation();
  });
}

function setupLibraryEdgeBackGesture() {
  document.addEventListener('touchstart', (event) => {
    if (!isMobileDevice() || !el.playerSheet?.hidden || !el.libraryView || el.libraryView.hidden) return;
    if (!canNavigateLibraryBack() || document.querySelector('dialog[open]')) return;
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    if (touch.clientX > 26) return;
    if (event.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    edgeBackGesture = {
      startX: touch.clientX,
      startY: touch.clientY,
      startTime: Date.now(),
      locked: false,
      cancelled: false
    };
  }, { passive: true });

  document.addEventListener('touchmove', (event) => {
    if (!edgeBackGesture || edgeBackGesture.cancelled || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - edgeBackGesture.startX;
    const dy = touch.clientY - edgeBackGesture.startY;
    if (!edgeBackGesture.locked) {
      if (Math.hypot(dx, dy) < 10) return;
      if (dx <= 0 || Math.abs(dy) > Math.max(1, dx) * 0.9) {
        edgeBackGesture.cancelled = true;
        clearLibraryEdgeBackVisuals();
        return;
      }
      edgeBackGesture.locked = true;
      if (el.edgeBackIndicator) el.edgeBackIndicator.hidden = false;
      el.libraryView.style.willChange = 'transform, opacity';
    }
    event.preventDefault();
    const width = Math.max(320, window.innerWidth || el.libraryView.clientWidth || 400);
    const progress = Math.min(1, Math.max(0, dx / Math.min(132, width * 0.32)));
    const offset = Math.min(72, dx * 0.34);
    el.libraryView.style.transform = `translate3d(${offset}px, 0, 0)`;
    el.libraryView.style.opacity = String(1 - progress * 0.08);
    if (el.edgeBackIndicator) {
      el.edgeBackIndicator.style.transform = `translate3d(${Math.min(20, dx * 0.16)}px, -50%, 0) scale(${0.9 + progress * 0.1})`;
      el.edgeBackIndicator.style.opacity = String(0.45 + progress * 0.55);
    }
  }, { passive: false });

  document.addEventListener('touchend', (event) => {
    if (!edgeBackGesture) return;
    const gesture = edgeBackGesture;
    edgeBackGesture = null;
    if (gesture.cancelled || !gesture.locked || event.changedTouches.length !== 1) {
      settleLibraryEdgeBack(false);
      return;
    }
    const touch = event.changedTouches[0];
    const dx = touch.clientX - gesture.startX;
    const dy = touch.clientY - gesture.startY;
    const elapsed = Math.max(1, Date.now() - gesture.startTime);
    settleLibraryEdgeBack(shouldCommitSwipe(dx, dy, elapsed, window.innerWidth || 400));
  }, { passive: true });

  document.addEventListener('touchcancel', () => {
    if (!edgeBackGesture) return;
    edgeBackGesture = null;
    settleLibraryEdgeBack(false);
  }, { passive: true });
}

/* Deep Scan — 현재 폴더 + 모든 하위 폴더의 미디어를 한 번에 로딩 */
async function applyFolderView() {
  if (state.demo) {
    startDemoMode();
    return;
  }
  if (state.deepScan) {
    ensureTreeCache().then(() => {
      if (state.deepScan) computeAndRenderSubtree();
    });
    return;
  }
  const generation = state.listGeneration + 1;
  const loaded = await loadFiles({ append: false });
  if (!loaded || generation !== state.listGeneration || state.sort !== 'random') return;
  try {
    el.libraryStatus.textContent = '대상 폴더의 전체 미디어를 모아 무작위로 섞는 중…';
    await ensureAllPagesLoaded();
    if (generation !== state.listGeneration || state.sort !== 'random') return;
    shuffleCurrentFiles();
    renderFiles({ resetWindow: true });
    el.libraryStatus.textContent = '';
  } catch (error) {
    if (error?.name !== 'AbortError') {
      el.libraryStatus.textContent = `전체 파일을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    }
  }
}

async function ensureTreeCache() {
  if (state.treeCache) return state.treeCache;
  if (state.treeCachePromise) return state.treeCachePromise;
  const promise = collectTreeCache();
  state.treeCachePromise = promise;
  try {
    return await promise;
  } finally {
    if (state.treeCachePromise === promise) state.treeCachePromise = null;
  }
}

async function collectTreeCache() {
  if (!hasUsableToken()) {
    showSetup();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return;
  }
  state.loadingTree = true;
  const controller = new AbortController();
  state.treeAbort = controller;
  if (el.deepScanToggle) el.deepScanToggle.disabled = true;
  if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = false;
  el.libraryStatus.textContent = '드라이브 전체 폴더 트리를 수집하는 중…';
  try {
    await resolveRootFolderId();
    const items = [];
    let pageToken = null;
    const seenPageTokens = new Set();
    do {
      const params = new URLSearchParams({
        pageSize: String(DRIVE_PAGE_SIZE),
        orderBy: 'folder,modifiedTime desc',
        q: `trashed = false and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/' or mimeType contains 'image/')`,
        spaces: 'drive',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        corpora: 'user',
        fields: 'nextPageToken,incompleteSearch,files(id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,driveId,capabilities(canDownload,canDelete,canMoveItemOutOfDrive,canMoveItemWithinDrive),parents,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal });
      const data = await response.json();
      items.push(...(Array.isArray(data.files) ? data.files : []));
      if (data.incompleteSearch) {
        throw new Error('Google Drive가 전체 폴더 트리를 완전하게 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.');
      }
      const next = data.nextPageToken || null;
      if (next && seenPageTokens.has(next)) throw new Error('Drive가 같은 페이지 토큰을 반복했습니다.');
      if (next) seenPageTokens.add(next);
      pageToken = next;
      el.libraryStatus.textContent = `드라이브 전체 폴더 트리 수집 중… ${items.length.toLocaleString('ko-KR')}개 항목`;
    } while (pageToken);
    state.treeCache = buildTreeIndexes(items);
    el.libraryStatus.textContent = '';
    return state.treeCache;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      // 사용자가 중지 버튼으로 취소 — 부분 데이터는 폐기하고 일반 모드로 복귀한다.
      el.libraryStatus.textContent = '폴더 트리 수집을 중단했습니다.';
      state.deepScan = false;
      syncDeepScanToggle();
      applyFolderView();
      return;
    }
    console.error(error);
    el.libraryStatus.textContent = `하위 폴더 전체를 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    if (error.status === 401) {
      clearToken(false);
      if (state.clientId && validateClientId(state.clientId)) attemptSilentAutoLogin({ background: true });
      else showSetup();
    }
    state.deepScan = false;
    syncDeepScanToggle();
  } finally {
    state.loadingTree = false;
    state.treeAbort = null;
    if (el.deepScanToggle) el.deepScanToggle.disabled = false;
    if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = true;
  }
}

function buildTreeIndexes(items) {
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
  return { items, foldersById, foldersByParent, mediaByParent };
}

function collectFavoriteMediaFromCatalog(catalog, favoriteIds, rootFolderId = null) {
  const favorites = favoriteIds instanceof Set ? favoriteIds : new Set(favoriteIds || []);
  const items = Array.isArray(catalog?.items) ? catalog.items : [];
  return dedupeFiles(items.filter((file) => (
    file?.id && file.mimeType !== FOLDER_MIME
    && (file.mimeType?.startsWith('video/') || file.mimeType?.startsWith('image/'))
    && favorites.has(file.id)
  ))).map((file) => {
    const parent = file.parents?.[0] || 'root';
    file.__origin = catalog?.foldersById?.get(parent)?.name || (parent === rootFolderId || parent === 'root' ? '내 드라이브' : '');
    return file;
  });
}

function effectiveRootId() {
  if (state.currentFolderId !== 'root') return state.currentFolderId;
  return state.rootFolderId || 'root';
}

function computeAndRenderSubtree() {
  const cache = state.treeCache;
  if (!cache) return;
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
  el.libraryStatus.textContent = '';
  updateLibrarySummary();
}

async function setLibraryFilter(filter) {
  const next = ['all', 'video', 'image', 'favorites'].includes(filter) ? filter : 'all';
  state.filter = next;
  el.filterButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.filter === next));
  });
  if (next === 'favorites') {
    await loadFavoriteFiles();
  } else {
    renderFiles({ resetWindow: true });
  }
}

async function loadFavoriteFiles({ refreshState = true } = {}) {
  if (state.loadingFavorites) return;
  state.loadingFavorites = true;
  el.libraryStatus.textContent = '계정의 좋아요 항목을 모든 폴더에서 모으는 중…';
  try {
    await initializeAccountMediaState({ refresh: refreshState });
    const catalog = state.demo ? state.treeCache : await ensureTreeCache();
    if (state.filter !== 'favorites') return;
    const favoriteIds = accountFavoriteIds(state.accountMediaState);
    const resolvedCatalog = Array.isArray(catalog?.items)
      ? catalog
      : buildTreeIndexes(state.files);
    state.favoriteFiles = collectFavoriteMediaFromCatalog(resolvedCatalog, favoriteIds, state.rootFolderId);
    renderFiles({ resetWindow: true });
    el.libraryStatus.textContent = '';
  } catch (error) {
    console.error('Favorite files could not be loaded:', error);
    state.favoriteFiles = [];
    if (state.filter === 'favorites') renderFiles({ resetWindow: true });
    el.libraryStatus.textContent = `좋아요 항목을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
  } finally {
    state.loadingFavorites = false;
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
  const crumbs = [{ id: 'root', name: '내 드라이브' }, ...state.folderStack, { id: state.currentFolderId, name: state.currentFolderName }];
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

function parseRetryAfterMs(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds) && seconds >= 0) return Math.min(MAX_ORIGINAL_RETRY_AFTER_MS, seconds * 1000);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.min(MAX_ORIGINAL_RETRY_AFTER_MS, Math.max(0, timestamp - now));
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(resolve, delayMs);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new DOMException('Request aborted', 'AbortError'));
    }, { once: true });
  });
}

async function driveFetch(url, options = {}, _retried = false, _rateAttempt = 0) {
  const maxRateAttempts = Math.max(1, Math.min(3, Number(options.driveMaxRateAttempts) || 3));
  const requestOptions = { ...options };
  delete requestOptions.driveMaxRateAttempts;
  if (!hasUsableToken()) {
    if (!_retried && state.clientId && validateClientId(state.clientId)) {
      await requestGoogleToken({ background: true, force: true });
      if (hasUsableToken()) return driveFetch(url, options, true, _rateAttempt);
    }
    const error = new Error('Google 인증이 만료되었습니다.');
    error.status = 401;
    throw error;
  }
  const requestToken = state.token;
  const response = await fetch(url, {
    ...requestOptions,
    cache: 'no-store',
    headers: { ...(requestOptions.headers || {}), Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    if (response.status === 401 && !_retried && state.clientId && validateClientId(state.clientId)) {
      // A concurrent request may already have replaced the rejected token.
      if (state.token !== requestToken && hasUsableToken()) {
        return driveFetch(url, options, true, _rateAttempt);
      }
      const refreshed = await requestGoogleToken({ background: true, force: true });
      if (refreshed && hasUsableToken()) return driveFetch(url, options, true, _rateAttempt);
      if (state.token === requestToken) clearToken(false);
    }
    const reasons = (body?.error?.errors || []).map((item) => item?.reason).filter(Boolean);
    const rateLimited = response.status === 429
      || (response.status === 403 && reasons.some((reason) => /rateLimitExceeded/i.test(reason)));
    if (rateLimited && _rateAttempt < maxRateAttempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      const delayMs = retryAfterMs || 500 * (2 ** _rateAttempt) + Math.floor(Math.random() * 250);
      await waitForRetry(delayMs, options.signal);
      return driveFetch(url, options, _retried, _rateAttempt + 1);
    }
    const detail = body?.error?.message || response.statusText || '';
    const error = new Error(detail || `Drive API ${response.status}`);
    error.status = response.status;
    error.reasons = reasons;
    error.driveReason = reasons[0] || '';
    error.retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    throw error;
  }
  return response;
}

function escapeDriveQueryLiteral(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function accountStateCacheKey(accountId = state.accountId) {
  return accountId ? `${ACCOUNT_STATE_CACHE_PREFIX}${accountId}` : '';
}

function readCachedAccountMediaState(accountId) {
  const key = accountStateCacheKey(accountId);
  if (!key) return createEmptyAccountMediaState();
  try {
    return normalizeAccountMediaState(JSON.parse(localStorage.getItem(key) || '{}'));
  } catch (_) {
    return createEmptyAccountMediaState();
  }
}

function persistAccountMediaState() {
  const key = accountStateCacheKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(normalizeAccountMediaState(state.accountMediaState)));
  } catch (_) {}
}

async function resolveDriveAccountId() {
  const response = await driveFetch(`${DRIVE_API}/about?fields=user(permissionId)`);
  const data = await response.json();
  return String(data?.user?.permissionId || '');
}

async function findAccountStateFile() {
  const params = new URLSearchParams({
    spaces: 'appDataFolder',
    pageSize: '10',
    orderBy: 'modifiedTime desc',
    q: `name = '${escapeDriveQueryLiteral(ACCOUNT_STATE_FILE_NAME)}' and trashed = false`,
    fields: 'files(id,name,modifiedTime)'
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`);
  const data = await response.json();
  return Array.isArray(data.files) ? (data.files[0] || null) : null;
}

async function readAccountStateFile(fileId) {
  if (!fileId) return createEmptyAccountMediaState();
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return normalizeAccountMediaState(await response.json());
}

async function createAccountStateFile(accountState) {
  const boundary = `drive_original_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({
    name: ACCOUNT_STATE_FILE_NAME,
    mimeType: 'application/json',
    parents: ['appDataFolder']
  });
  const payload = JSON.stringify(normalizeAccountMediaState(accountState));
  const body = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    metadata,
    `--${boundary}`,
    'Content-Type: application/json',
    '',
    payload,
    `--${boundary}--`,
    ''
  ].join('\r\n');
  const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
    method: 'POST',
    headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
    body
  });
  return response.json();
}

async function updateAccountStateFile(fileId, accountState) {
  const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalizeAccountMediaState(accountState))
  });
  return response.json();
}

async function initializeAccountMediaState({ refresh = false } = {}) {
  if (state.demo) {
    state.accountId = 'demo';
    state.accountStateLoaded = true;
    return state.accountMediaState;
  }
  if (!hasUsableToken()) return state.accountMediaState;
  if (state.accountStateLoaded && !refresh) return state.accountMediaState;
  if (state.accountStateLoadingPromise) return state.accountStateLoadingPromise;

  const operation = (async () => {
    const accountId = await resolveDriveAccountId();
    if (!accountId) throw new Error('Google Drive 계정 식별 정보를 확인하지 못했습니다.');
    if (state.accountId !== accountId) {
      state.accountId = accountId;
      state.accountStateFileId = null;
      state.accountMediaState = readCachedAccountMediaState(accountId);
    }
    const file = await findAccountStateFile();
    state.accountStateFileId = file?.id || null;
    const remote = file?.id ? await readAccountStateFile(file.id) : createEmptyAccountMediaState();
    const merged = mergeAccountMediaStates(remote, state.accountMediaState);
    const remoteNeedsMerge = JSON.stringify(merged) !== JSON.stringify(remote);
    state.accountMediaState = merged;
    state.accountStateLoaded = true;
    state.accountStateLastSyncAt = Date.now();
    persistAccountMediaState();
    refreshFavoritePresentation();
    // A device may reconnect with newer offline cache entries. Push that
    // merged result so the next device sees those changes without requiring
    // another like or playback action first.
    if (remoteNeedsMerge) queueAccountStateSync();
    return state.accountMediaState;
  })();
  state.accountStateLoadingPromise = operation;
  try {
    return await operation;
  } finally {
    if (state.accountStateLoadingPromise === operation) state.accountStateLoadingPromise = null;
  }
}

async function flushAccountMediaState() {
  if (state.demo || !hasUsableToken() || !state.accountId) return;
  if (state.accountStateSyncPromise) return state.accountStateSyncPromise;
  const revisionAtStart = state.accountStateRevision;
  const operation = (async () => {
    let fileId = state.accountStateFileId;
    if (!fileId) {
      const existing = await findAccountStateFile();
      fileId = existing?.id || null;
      state.accountStateFileId = fileId;
    }
    const remote = fileId ? await readAccountStateFile(fileId) : createEmptyAccountMediaState();
    const merged = mergeAccountMediaStates(remote, state.accountMediaState);
    merged.updatedAt = Math.max(Date.now(), merged.updatedAt);
    state.accountMediaState = merged;
    persistAccountMediaState();
    if (fileId) {
      await updateAccountStateFile(fileId, merged);
    } else {
      const created = await createAccountStateFile(merged);
      state.accountStateFileId = created?.id || null;
    }
    state.accountStateLastSyncAt = Date.now();
  })();
  state.accountStateSyncPromise = operation;
  try {
    await operation;
  } catch (error) {
    console.warn('Account media state could not be synced:', error);
  } finally {
    if (state.accountStateSyncPromise === operation) state.accountStateSyncPromise = null;
    if (state.accountStateRevision !== revisionAtStart) queueAccountStateSync();
  }
}

function queueAccountStateSync() {
  persistAccountMediaState();
  if (state.demo || !state.accountId) return;
  clearTimeout(state.accountStateSyncTimer);
  state.accountStateSyncTimer = setTimeout(() => {
    state.accountStateSyncTimer = null;
    flushAccountMediaState();
  }, ACCOUNT_STATE_SYNC_DELAY_MS);
}

function getViewedIdSet() {
  return accountViewedIds(state.accountMediaState);
}

function buildAccountPlaybackDeck(files, selectedId, random = Math.random, depth = VERTICAL_DECK_DEPTH) {
  return buildVerticalPlaybackDeck(files, selectedId, random, depth, getViewedIdSet());
}

function advanceAccountPlaybackDeck(deck, direction, targetId, files, random = Math.random) {
  return advanceVerticalPlaybackDeck(deck, direction, targetId, files, random, getViewedIdSet());
}

function isFavoriteFileId(fileId) {
  return Boolean(fileId && state.accountMediaState?.favorites?.[fileId]?.liked);
}

function markFileViewed(fileId) {
  if (!fileId) return;
  const now = Date.now();
  const current = Number(state.accountMediaState.viewed?.[fileId]) || 0;
  if (current >= now) return;
  state.accountMediaState.viewed[fileId] = now;
  state.accountMediaState.updatedAt = now;
  state.accountStateRevision += 1;
  queueAccountStateSync();
}

function setFavoriteFile(fileId, liked) {
  if (!fileId) return false;
  const nextLiked = Boolean(liked);
  const current = state.accountMediaState.favorites?.[fileId];
  if (current?.liked === nextLiked) return nextLiked;
  const now = Date.now();
  state.accountMediaState.favorites[fileId] = { liked: nextLiked, updatedAt: now };
  state.accountMediaState.updatedAt = now;
  state.accountStateRevision += 1;
  if (!nextLiked) state.favoriteFiles = state.favoriteFiles.filter((file) => file.id !== fileId);
  else {
    const known = state.treeCache?.items?.find((file) => file.id === fileId)
      || state.files.find((file) => file.id === fileId)
      || (state.selected?.id === fileId ? state.selected : null);
    if (known && !state.favoriteFiles.some((file) => file.id === fileId)) state.favoriteFiles.push(known);
  }
  queueAccountStateSync();
  refreshFavoritePresentation();
  if (state.filter === 'favorites') renderFiles({ resetWindow: true });
  return nextLiked;
}

function markFilesRemovedFromAccountState(fileIds) {
  const ids = fileIds instanceof Set ? fileIds : new Set(fileIds || []);
  if (!ids.size) return;
  const now = Date.now();
  ids.forEach((id) => {
    delete state.accountMediaState.viewed[id];
    state.accountMediaState.favorites[id] = { liked: false, updatedAt: now };
  });
  state.accountMediaState.updatedAt = now;
  state.favoriteFiles = state.favoriteFiles.filter((file) => !ids.has(file.id));
  state.accountStateRevision += 1;
  queueAccountStateSync();
  refreshFavoritePresentation();
}

function toggleFavoriteForSelected({ showFeedback = false } = {}) {
  if (!state.selected?.id) return false;
  const liked = setFavoriteFile(state.selected.id, !isFavoriteFileId(state.selected.id));
  if (showFeedback) showFavoriteFeedback(liked);
  return liked;
}

function refreshFavoritePresentation() {
  const selectedLiked = isFavoriteFileId(state.selected?.id);
  [el.topbarFavoriteBtn, el.ctrlFavorite, el.shortsFavoriteBtn].forEach((button) => {
    if (!button) return;
    button.setAttribute('aria-pressed', String(selectedLiked));
    button.setAttribute('aria-label', selectedLiked ? '좋아요 취소' : '좋아요 추가');
    button.title = selectedLiked ? '좋아요 취소' : '좋아요';
    button.classList.toggle('is-favorite', selectedLiked);
  });
  document.querySelectorAll?.('.file-card-favorite').forEach((button) => {
    const liked = isFavoriteFileId(button.dataset.fileId);
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? '좋아요 취소' : '좋아요 추가');
    button.title = liked ? '좋아요 취소' : '좋아요';
    button.classList.toggle('is-favorite', liked);
  });
}

function showFavoriteFeedback(liked) {
  const feedback = el.favoriteFeedback;
  if (!feedback) return;
  const label = liked ? '좋아요' : '좋아요 취소';
  const text = feedback.querySelector('span');
  if (text) text.textContent = label;
  feedback.classList.toggle('is-removing', !liked);
  feedback.hidden = false;
  feedback.classList.remove('active');
  void feedback.offsetWidth;
  feedback.classList.add('active');
  clearTimeout(feedback._hideTimer);
  feedback._hideTimer = setTimeout(() => {
    feedback.classList.remove('active');
    setTimeout(() => {
      if (!feedback.classList.contains('active')) feedback.hidden = true;
    }, 180);
  }, 620);
}

async function fetchOriginalFileResponse(file, options = {}) {
  return driveFetch(buildDriveMediaApiUrl(file), {
    ...options,
    driveMaxRateAttempts: 1
  });
}

function tryQuietTokenRefresh() {
  return requestGoogleToken({ background: true, force: true });
}

let renderWindowRaf = 0;

function getGridColumnCount() {
  if (!el.fileGrid) return 1;
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
    const requestedStart = Math.max(0, (focusRow - 4) * columns);
    const nextWindow = computeRenderWindow(files.length, requestedStart, columns);
    const currentWindow = computeRenderWindow(files.length, state.renderWindowStart, columns);
    const threshold = Math.max(columns, Math.floor((currentWindow.end - currentWindow.start) * RENDER_WINDOW_STEP_RATIO / columns) * columns);
    if (columns !== state.renderColumnCount || Math.abs(nextWindow.start - state.renderWindowStart) >= threshold) {
      state.renderScrollDirection = nextWindow.start > state.renderWindowStart ? 'down' : 'up';
      state.renderWindowStart = nextWindow.start;
      renderMediaGrid(files);
    }
  });
}

function renderMediaGrid(files) {
  if (!el.fileGrid) return;
  const columns = getGridColumnCount();
  state.renderColumnCount = columns;
  const windowRange = computeRenderWindow(files.length, state.renderWindowStart, columns);
  state.renderWindowStart = windowRange.start;
  const topRows = Math.floor(windowRange.start / columns);
  const bottomRows = Math.ceil(Math.max(0, files.length - windowRange.end) / columns);
  const fragment = document.createDocumentFragment();
  files.slice(windowRange.start, windowRange.end).forEach((file, index) => {
    fragment.appendChild(createFileCard(file, index, windowRange.start + index));
  });
  el.fileGrid.style.paddingTop = `${topRows * state.renderRowHeight}px`;
  el.fileGrid.style.paddingBottom = `${bottomRows * state.renderRowHeight}px`;
  el.fileGrid.replaceChildren(fragment);
  pruneStaticGifThumbnailEntries();
  const firstCard = el.fileGrid.querySelector('.file-card');
  if (firstCard?.offsetHeight && Math.abs((firstCard.offsetHeight + 12) - state.renderRowHeight) >= 5) {
    state.renderRowHeight = firstCard.offsetHeight + 12;
    el.fileGrid.style.paddingTop = `${topRows * state.renderRowHeight}px`;
    el.fileGrid.style.paddingBottom = `${bottomRows * state.renderRowHeight}px`;
  }
}

function renderFiles({ resetWindow = false } = {}) {
  const files = filteredAndSortedFiles();
  if (resetWindow) state.renderWindowStart = 0;
  const visibleFolders = state.filter === 'all'
    ? state.folders.filter((f) => !state.query || String(f.name || '').toLocaleLowerCase('ko').includes(state.query))
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
  el.emptyState.hidden = files.length + visibleFolders.length > 0;
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

  const meta = document.createElement('span');
  meta.className = 'folder-meta';
  meta.textContent = '폴더';

  const chevron = document.createElement('span');
  chevron.className = 'folder-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  button.append(glyph, name, meta, chevron);
  button.addEventListener('click', () => navigateToFolder(folder.id, folder.name));
  return button;
}

function shuffleCurrentFiles() {
  shuffledOrderMap.clear();
  const shuffled = [...currentPopulationFiles()];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((file, index) => {
    shuffledOrderMap.set(file.id, index);
  });
}

/* 무한 스크롤로 아직 불러오지 않은 페이지가 있을 때 전부 로드한다.
   랜덤 배열·랜덤 쇼츠가 '대상 폴더(또는 딥스캔 서브트리)의 전체 파일'을
   대상으로 동작하도록 보장한다. 진행 중 로드가 있으면 끝날 때까지 대기 후 이어 받는다. */
async function ensureAllPagesLoaded() {
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
      const loaded = await loadFiles({ append: true });
      if (!loaded) {
        if (generation !== state.listGeneration) throw new DOMException('Collection aborted', 'AbortError');
        throw new Error('Drive 파일 페이지를 끝까지 불러오지 못했습니다.');
      }
      el.libraryStatus.textContent = `대상 폴더 전체 미디어 수집 중… ${state.files.length.toLocaleString('ko-KR')}개`;
    }
    state.populationComplete = true;
  })();
  state.populationLoadPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.populationLoadPromise === promise) state.populationLoadPromise = null;
  }
}

function filteredAndSortedFiles() {
  return sortedPopulationFiles().filter((file) => {
    const isVideo = file.mimeType?.startsWith('video/');
    const typeMatch = state.filter === 'all' || state.filter === 'favorites'
      || (state.filter === 'video' && isVideo) || (state.filter === 'image' && !isVideo);
    const queryMatch = !state.query || String(file.name || '').toLocaleLowerCase('ko').includes(state.query);
    return typeMatch && queryMatch;
  });
}

function currentPopulationFiles() {
  return state.filter === 'favorites' ? state.favoriteFiles : state.files;
}

function sortedPopulationFiles() {
  const population = currentPopulationFiles();
  const files = [...population];
  if (state.sort === 'random') {
    if (shuffledOrderMap.size !== population.length) {
      shuffleCurrentFiles();
    }
    return files.sort((a, b) => {
      const idxA = shuffledOrderMap.get(a.id) ?? 0;
      const idxB = shuffledOrderMap.get(b.id) ?? 0;
      return idxA - idxB;
    });
  }

  return files.sort((a, b) => {
    if (state.sort === 'name') return String(a.name).localeCompare(String(b.name), 'ko', { numeric: true });
    if (state.sort === 'size') return Number(b.size || 0) - Number(a.size || 0);
    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
  });
}

function getSelectedFiles() {
  return state.files.filter((file) => state.selectedFileIds.has(file.id));
}

function getActionFiles() {
  const selectedFiles = getSelectedFiles();
  if (state.selectionMode && selectedFiles.length) return selectedFiles;
  return state.selected ? [state.selected] : [];
}

function enterSelectionMode(initialFile = null) {
  state.selectionMode = true;
  if (initialFile?.id) state.selectedFileIds.add(initialFile.id);
  updateSelectionUI();
}

function exitSelectionMode() {
  state.selectionMode = false;
  state.selectedFileIds.clear();
  state.pendingActionFiles = [];
  updateSelectionUI();
}

function toggleFileSelection(file) {
  if (!file?.id) return;
  if (!state.selectionMode) state.selectionMode = true;
  if (state.selectedFileIds.has(file.id)) state.selectedFileIds.delete(file.id);
  else state.selectedFileIds.add(file.id);
  updateSelectionUI();
}

async function selectAllVisibleFiles() {
  if (!state.selectionMode || state.bulkAction) return;
  setButtonLoading(el.selectionSelectAllBtn, true, '전체 확인 중…');
  try {
    await ensureAllPagesLoaded();
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
  if (el.selectionDeleteBtn) el.selectionDeleteBtn.disabled = count === 0 || state.bulkAction;
  if (el.selectionMoveBtn) el.selectionMoveBtn.disabled = count === 0 || state.bulkAction;
  if (el.selectionSelectAllBtn) el.selectionSelectAllBtn.disabled = state.bulkAction;
  el.fileGrid?.classList.toggle('selection-mode', state.selectionMode);
  el.fileGrid?.querySelectorAll?.('.file-card').forEach((card) => {
    const selected = state.selectedFileIds.has(card.dataset.fileId);
    card.classList.toggle('selected', selected);
    card.querySelector('.file-card-open')?.setAttribute('aria-pressed', String(selected));
    const check = card.querySelector('.file-card-select-check');
    if (check) check.setAttribute('aria-hidden', String(!state.selectionMode));
  });
}

function installCardSelectionGestures(button, file) {
  const card = button.closest?.('.file-card') || button;
  let timer = null;
  let startX = 0;
  let startY = 0;
  let pointerId = null;
  let suppressClick = false;
  const clear = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    pointerId = null;
    card.classList.remove('long-press-pending');
  };
  button.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'mouse' || event.button !== 0 || state.bulkAction) return;
    startX = event.clientX;
    startY = event.clientY;
    pointerId = event.pointerId;
    card.classList.add('long-press-pending');
    timer = setTimeout(() => {
      timer = null;
      suppressClick = true;
      enterSelectionMode(file);
      navigator.vibrate?.(12);
    }, 520);
  });
  button.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    if (Math.hypot(event.clientX - startX, event.clientY - startY) > 10) clear();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((type) => button.addEventListener(type, clear));
  button.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!state.selectionMode && !state.bulkAction) enterSelectionMode(file);
  });
  button.addEventListener('click', (event) => {
    if (suppressClick) {
      suppressClick = false;
      event.preventDefault();
      return;
    }
    if (state.selectionMode) {
      event.preventDefault();
      toggleFileSelection(file);
    }
  });
}

function createFileCard(file, index = 0, absoluteIndex = index) {
  const isVideo = file.mimeType?.startsWith('video/');
  const isGif = isGifFile(file);
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

  const visual = document.createElement('div');
  visual.className = `file-card-visual ${isVideo ? 'video' : 'image'}`;
  
  if (isGif) {
    const placeholder = document.createElement('div');
    placeholder.className = 'file-card-gif-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    placeholder.innerHTML = '<svg viewBox="0 0 64 64" fill="none"><rect x="12" y="14" width="40" height="36" rx="8" stroke="currentColor" stroke-width="2"/><path d="m18 43 10-10 7 7 6-6 5 5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><circle cx="41" cy="25" r="4" fill="currentColor"/></svg><span>GIF</span>';
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
        if (isVideo) extractVideoFrameThumbnail(file, thumbnail, visual);
        else thumbnail.remove();
      }, { once: true });
      if (playerMediaPriorityActive) thumbnail.dataset.playerDeferredSrc = file.thumbnailLink;
      else thumbnail.src = file.thumbnailLink;
      visual.appendChild(thumbnail);
    } else if (isVideo) {
      visual.appendChild(thumbnail);
      extractVideoFrameThumbnail(file, thumbnail, visual);
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
  const status = document.createElement('span');
  status.className = 'file-card-status';
  status.textContent = canDownload ? '원본 파일 재생' : '다운로드 제한';
  meta.append(details, status);

  body.append(name, meta);
  button.append(visual, body);
  const favoriteButton = document.createElement('button');
  favoriteButton.type = 'button';
  favoriteButton.className = 'file-card-favorite';
  favoriteButton.dataset.fileId = file.id;
  favoriteButton.setAttribute('aria-pressed', String(isFavoriteFileId(file.id)));
  favoriteButton.setAttribute('aria-label', isFavoriteFileId(file.id) ? '좋아요 취소' : '좋아요 추가');
  favoriteButton.title = isFavoriteFileId(file.id) ? '좋아요 취소' : '좋아요';
  favoriteButton.classList.toggle('is-favorite', isFavoriteFileId(file.id));
  favoriteButton.innerHTML = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  favoriteButton.addEventListener('click', (event) => {
    event.stopPropagation();
    const liked = setFavoriteFile(file.id, !isFavoriteFileId(file.id));
    flashPressed(favoriteButton);
    showToast(liked ? '좋아요에 추가했습니다.' : '좋아요를 취소했습니다.');
  });
  card.append(button, favoriteButton);
  installCardSelectionGestures(button, file);
  button.addEventListener('click', () => {
    if (state.selectionMode) return;
    openPlayer(file);
  });
  return card;
}

function updateLibrarySummary(visibleCount, visibleFolderCount) {
  const mediaCount = Number.isFinite(visibleCount) ? visibleCount : state.files.length;
  if (state.filter === 'favorites') {
    el.librarySummary.textContent = `좋아요 미디어 ${mediaCount.toLocaleString('ko-KR')}개 · 모든 폴더`;
    return;
  }
  const folderCount = Number.isFinite(visibleFolderCount) ? visibleFolderCount : state.folders.length;
  const parts = [];
  if (folderCount > 0) parts.push(`폴더 ${folderCount.toLocaleString('ko-KR')}개`);
  parts.push(`미디어 ${mediaCount.toLocaleString('ko-KR')}개 표시`);
  if (state.nextPageToken) parts.push('더 불러오는 중…');
  if (state.deepScan && state.treeCache) parts.push('하위 폴더 전체 포함');
  el.librarySummary.textContent = parts.join(' · ');
}

function openPlayer(file) {
  playerReturnFocus = typeof document.activeElement?.focus === 'function' ? document.activeElement : null;
  state.playbackSession += 1;
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
  setStageImmersive(false);
  el.playerTitle.textContent = file.name || '이름 없는 파일';
  el.codecNote.textContent = state.demo
    ? '데모 화면은 저장 파일 정보를 예시로 보여 주며 실제 원본 바이트를 재생하지 않습니다.'
    : 'Google Drive 원본 파일의 무변환 전송 여부를 확인하는 중입니다.';
  const isVideo = file.mimeType?.startsWith('video/');
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
  requestAnimationFrame(() => el.closePlayerButton.focus());
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

function resetControlsTimer() {
  if (el.playerModal) el.playerModal.classList.remove('controls-idle');
  clearTimeout(controlsHideTimer);
  if (state.mediaAttempt.startsWith('drive-preview')) return;
  if (el.playerSheet && !el.playerSheet.hidden && !isSeekingPointer && !hasOpenPlayerControlsMenu()) {
    controlsHideTimer = setTimeout(() => {
      if (el.playerSheet && !el.playerSheet.hidden && !isSeekingPointer && !hasOpenPlayerControlsMenu()) {
        if (el.playerModal) el.playerModal.classList.add('controls-idle');
      }
    }, 1800);
  }
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
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  if (!isVideo) {
    if (el.customVideoControls) el.customVideoControls.hidden = true;
    if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.hidden = true;
    updateFrameStepVisibility(false);
    return;
  }
  if (el.customVideoControls) el.customVideoControls.hidden = false;
  const isPaused = el.videoPlayer.paused;
  if (el.ctrlIconPlay && el.ctrlIconPause) {
    el.ctrlIconPlay.hidden = !isPaused;
    el.ctrlIconPause.hidden = isPaused;
  }
  if (el.iconCenterPlay && el.iconCenterPause) {
    el.iconCenterPlay.hidden = !isPaused;
    el.iconCenterPause.hidden = isPaused;
  }
  if (el.stageCenterPlayBtn) {
    el.stageCenterPlayBtn.hidden = !isPaused;
  }
  updateFrameStepVisibility(isPaused);
}

function updateFrameStepVisibility(show = Boolean(el.videoPlayer && !el.videoPlayer.hidden && el.videoPlayer.paused)) {
  const visible = Boolean(show && el.videoPlayer && !el.videoPlayer.hidden);
  [el.ctrlFramePrev, el.ctrlFrameNext, el.shortsFramePrev, el.shortsFrameNext].forEach((button) => {
    if (button) button.hidden = !visible;
  });
}

function seekRelative(deltaSeconds) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const duration = el.videoPlayer.duration || Infinity;
  const target = Math.max(0, Math.min(duration, el.videoPlayer.currentTime + deltaSeconds));
  el.videoPlayer.currentTime = target;
  showPlayerFeedback(deltaSeconds > 0 ? `+${deltaSeconds}S` : `${deltaSeconds}S`);
  updateVideoProgress();
  resetControlsTimer();
}

function beginVideoFrameSampling() {
  const video = el.videoPlayer;
  if (!video?.requestVideoFrameCallback || video.hidden || state.frameCallbackId != null) return;
  state.frameCallbackId = video.requestVideoFrameCallback((_now, metadata) => {
    state.frameCallbackId = null;
    const mediaTime = Number(metadata?.mediaTime);
    const previous = state.lastPresentedMediaTime;
    if (Number.isFinite(mediaTime) && Number.isFinite(previous)) {
      const delta = mediaTime - previous;
      if (delta >= 1 / 240 && delta <= 1 / 10) {
        state.frameDuration = state.frameDuration * 0.65 + delta * 0.35;
      }
    }
    if (Number.isFinite(mediaTime)) state.lastPresentedMediaTime = mediaTime;
    if (!video.hidden) beginVideoFrameSampling();
  });
}

function stepVideoFrame(direction) {
  const video = el.videoPlayer;
  if (!video || video.hidden || !Number.isFinite(video.currentTime)) return;
  video.pause();
  state.pendingPlay = false;
  const duration = Number.isFinite(video.duration) ? video.duration : Infinity;
  const frameDuration = Math.min(1 / 10, Math.max(1 / 240, state.frameDuration || DEFAULT_FRAME_DURATION));
  video.currentTime = Math.max(0, Math.min(duration, video.currentTime + Math.sign(direction || 1) * frameDuration));
  updateVideoProgress();
  showPlayerFeedback(direction < 0 ? '−1 FRAME' : '+1 FRAME');
}

function toggleMute() {
  if (!el.videoPlayer) return;
  el.videoPlayer.muted = !el.videoPlayer.muted;
  showPlayerFeedback(el.videoPlayer.muted ? 'MUTE ON' : `VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
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
    el.ctrlIconVolHigh.hidden = isMuted;
    el.ctrlIconVolMuted.hidden = !isMuted;
  }
  if (el.ctrlVolumeSlider) {
    el.ctrlVolumeSlider.value = isMuted ? 0 : el.videoPlayer.volume;
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

function setPlaybackSpeed(speed) {
  if (!el.videoPlayer) return;
  el.videoPlayer.playbackRate = speed;
  if (el.ctrlSpeedText) el.ctrlSpeedText.textContent = `${speed}×`;
  const buttons = el.speedDropdown?.querySelectorAll('button') || [];
  buttons.forEach((btn) => {
    const active = Number(btn.dataset.speed) === speed;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-checked', String(active));
  });
  isSpeedMenuOpen = false;
  if (el.speedDropdown) el.speedDropdown.hidden = true;
  el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
  showPlayerFeedback(`SPEED ${speed}X`);
  resetControlsTimer();
}

function updateSpeedUI() {
  if (!el.videoPlayer) return;
  const speed = el.videoPlayer.playbackRate || 1;
  if (el.ctrlSpeedText) el.ctrlSpeedText.textContent = `${speed}×`;
}

function onDocumentClickForSpeedMenu(event) {
  if (isSpeedMenuOpen && !el.speedMenuWrap?.contains(event.target)) {
    isSpeedMenuOpen = false;
    if (el.speedDropdown) el.speedDropdown.hidden = true;
    el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
  }
  if (isPlayerMoreOpen && !el.playerMoreMenu?.contains(event.target)) {
    el.playerMoreMenu.open = false;
    isPlayerMoreOpen = false;
    resetControlsTimer();
  }
}

function onSpeedMenuKeyDown(event) {
  const buttons = el.speedButtons || [];
  const index = buttons.indexOf(event.currentTarget);
  if (event.key === 'Escape') {
    if (isPlayerMoreOpen) {
      if (el.playerMoreMenu) el.playerMoreMenu.open = false;
      isPlayerMoreOpen = false;
      resetControlsTimer();
      return;
    }
    event.preventDefault();
    isSpeedMenuOpen = false;
    el.speedDropdown.hidden = true;
    el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
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
  updateVideoProgress();
}

function onVideoProgressUpdate() {
  if (!el.videoPlayer || !el.seekBarBuffered) return;
  const duration = el.videoPlayer.duration;
  if (!duration || duration <= 0) return;
  const buffered = el.videoPlayer.buffered;
  if (buffered.length > 0) {
    const end = buffered.end(buffered.length - 1);
    const bufferedRatio = Math.min(1, Math.max(0, end / duration));
    el.seekBarBuffered.style.transform = `scaleX(${bufferedRatio})`;
  }
}

function updateVideoProgress() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const currentTime = el.videoPlayer.currentTime || 0;
  const duration = el.videoPlayer.duration || 0;
  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  if (el.seekBarPlayed) el.seekBarPlayed.style.transform = `scaleX(${ratio})`;
  if (el.seekBarThumb && el.seekBarContainer) {
    el.seekBarThumb.style.setProperty('--seek-x', `${ratio * el.seekBarContainer.clientWidth}px`);
  }
  if (el.mobileShortsProgressBar) el.mobileShortsProgressBar.style.transform = `scaleX(${ratio})`;
  if (el.ctrlCurrentTime) el.ctrlCurrentTime.textContent = formatPlayerTime(currentTime);
  if (el.ctrlTotalTime) el.ctrlTotalTime.textContent = formatPlayerTime(duration);
  if (el.seekBarContainer) {
    el.seekBarContainer.setAttribute('aria-valuenow', Math.round(currentTime));
    el.seekBarContainer.setAttribute('aria-valuemax', Math.round(duration));
    el.seekBarContainer.setAttribute('aria-valuetext', `${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`);
  }
  onVideoProgressUpdate();
}

function getSeekRatio(event) {
  const rect = el.seekBarContainer.getBoundingClientRect();
  const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
  const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  return rect.width > 0 ? clampedX / rect.width : 0;
}

function onSeekPointerDown(event) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  event.preventDefault();
  isSeekingPointer = true;
  el.seekBarContainer.classList.add('seeking');
  const ratio = getSeekRatio(event);
  const duration = el.videoPlayer.duration || 0;
  el.videoPlayer.currentTime = ratio * duration;
  updateVideoProgress();

  function onPointerMove(e) {
    if (!isSeekingPointer) return;
    const r = getSeekRatio(e);
    el.videoPlayer.currentTime = r * duration;
    updateVideoProgress();
    onSeekPointerHover(e);
  }

  function onPointerUp() {
    isSeekingPointer = false;
    el.seekBarContainer?.classList.remove('seeking');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    resetControlsTimer();
  }

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onSeekPointerHover(event) {
  if (!el.videoPlayer || !el.seekBarTooltip || el.videoPlayer.hidden) return;
  const ratio = getSeekRatio(event);
  const duration = el.videoPlayer.duration || 0;
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
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const track = el.mobileShortsProgressTrack;
  const duration = el.videoPlayer.duration || 0;
  if (!duration) return;
  event.preventDefault();
  isSeekingPointer = true;

  const seekToPointer = (e) => {
    const rect = track.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    el.videoPlayer.currentTime = ratio * duration;
    updateVideoProgress();
  };

  const onPointerUp = () => {
    isSeekingPointer = false;
    document.removeEventListener('pointermove', seekToPointer);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    resetControlsTimer();
  };

  seekToPointer(event);
  document.addEventListener('pointermove', seekToPointer);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onMediaStageClick(event) {
  const target = event.target;
  if (
    target.closest('.custom-video-controls') ||
    target.closest('.stage-center-btn') ||
    target.closest('.media-error') ||
    target.closest('.media-loading') ||
    target.tagName === 'BUTTON' ||
    target.tagName === 'A'
  ) {
    return;
  }
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  if (isVideo) {
    togglePlayPause();
  }
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
        console.warn('requestFullscreen error', err);
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
    el.iconExpand.hidden = isFs;
    el.iconCompress.hidden = !isFs;
  }
  if (el.ctrlIconExpand && el.ctrlIconCompress) {
    el.ctrlIconExpand.hidden = isFs;
    el.ctrlIconCompress.hidden = !isFs;
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
    console.warn('PiP error', err);
  }
}

/* Mobile shorts bottom action chips — ⋯ 버튼으로 삭제/이동/PiP/Drive 노출 */
let shortsExpandTimer = null;

function toggleShortsExpand() {
  if (!el.mobileShortsOverlay) return;
  const expanded = el.mobileShortsOverlay.classList.toggle('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', String(expanded));
  clearTimeout(shortsExpandTimer);
  shortsExpandTimer = null;
  if (expanded) {
    shortsExpandTimer = setTimeout(collapseShortsExpand, 5000);
  }
  resetControlsTimer();
}

function collapseShortsExpand() {
  clearTimeout(shortsExpandTimer);
  shortsExpandTimer = null;
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

function showPlayerFeedback(text) {
  if (!el.playerFeedback) return;
  el.playerFeedback.textContent = text;
  el.playerFeedback.hidden = false;
  requestAnimationFrame(() => el.playerFeedback.classList.add('active'));
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    el.playerFeedback.classList.remove('active');
    setTimeout(() => { if (!el.playerFeedback.classList.contains('active')) el.playerFeedback.hidden = true; }, 200);
  }, 850);
}

function getPlaybackFileList() {
  return sortedPopulationFiles();
}

function getPlaybackFileById(fileId, list = getPlaybackFileList()) {
  return (Array.isArray(list) ? list : []).find((file) => file?.id === fileId) || null;
}

function hasCompletePlaybackPopulation() {
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
  image.referrerPolicy = 'no-referrer';
  image.src = source;
  warmedThumbnails.set(file.id, image);
  while (warmedThumbnails.size > THUMBNAIL_WARM_LIMIT) {
    warmedThumbnails.delete(warmedThumbnails.keys().next().value);
  }
}

function warmPlaybackNeighborhood(file = state.selected, { loadPopulation = false } = {}) {
  if (!file?.id || el.playerSheet?.hidden) return;
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
        if (error?.name !== 'AbortError') console.warn('Playback pool warmup failed:', error);
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

function playNextFile(direction = 'left') {
  const dir = typeof direction === 'string' ? direction : 'left';
  return enqueuePlaybackNavigation(
    (list) => resolveSequentialPlaybackTarget('left', list),
    dir,
    undefined,
    false,
    (target, list) => {
      state.playbackDeck = buildAccountPlaybackDeck(list, target.id);
      state.playbackDeckComplete = hasCompletePlaybackPopulation();
    }
  );
}

function playPrevFile(direction = 'right') {
  const dir = typeof direction === 'string' ? direction : 'right';
  return enqueuePlaybackNavigation(
    (list) => resolveSequentialPlaybackTarget('right', list),
    dir,
    undefined,
    false,
    (target, list) => {
      state.playbackDeck = buildAccountPlaybackDeck(list, target.id);
      state.playbackDeckComplete = hasCompletePlaybackPopulation();
    }
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
    (target, list) => {
      state.playbackDeck = advanceAccountPlaybackDeck(state.playbackDeck, dir, target.id, list);
      if (!state.playbackOrderIds.includes(target.id)) state.playbackOrderIds.push(target.id);
    }
  );
}

function playFrozenSwipeTarget(targetId, direction) {
  const vertical = direction === 'up' || direction === 'down';
  return enqueuePlaybackNavigation(
    (list) => getPlaybackFileById(targetId, list),
    direction,
    vertical ? '랜덤 재생 준비 실패' : undefined,
    false,
    (target, list) => {
      if (vertical) {
        state.playbackDeck = advanceAccountPlaybackDeck(state.playbackDeck, direction, target.id, list);
        if (!state.playbackOrderIds.includes(target.id)) state.playbackOrderIds.push(target.id);
      } else {
        state.playbackDeck = buildAccountPlaybackDeck(list, target.id);
        state.playbackDeckComplete = hasCompletePlaybackPopulation();
      }
    }
  );
}

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouchActive = false;
let lockedAxis = null;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let singleTapTimer = null;

function trackSwipeCommit(navigationPromise) {
  swipeCommitPending = true;
  Promise.resolve(navigationPromise)
    .catch((error) => console.warn('Swipe navigation failed:', error))
    .finally(() => {
      swipeCommitPending = false;
      if (!el.playerSheet?.hidden) restoreDraggedMediaPosition();
    });
}

function getTapZone(clientX, clientY) {
  const rect = el.mediaStage.getBoundingClientRect();
  if (!rect.width || !rect.height) return 'center';
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx >= 0.3 && nx <= 0.7 && ny >= 0.3 && ny <= 0.7) return 'center';
  const edgeX = nx < 0.5 ? nx : 1 - nx;
  const edgeY = ny < 0.5 ? ny : 1 - ny;
  if (edgeX <= edgeY) return nx < 0.5 ? 'left' : 'right';
  return ny < 0.5 ? 'top' : 'bottom';
}

function setStageImmersive(on) {
  if (!el.playerModal) return;
  if (el.playerModal.classList.contains('immersive') === on) return;
  el.playerModal.classList.toggle('immersive', on);
  if (on) collapseShortsExpand();
  else resetControlsTimer();
}

function flashSeekHint(zone) {
  const hint = zone === 'left' ? el.seekHintLeft : zone === 'right' ? el.seekHintRight : null;
  if (!hint) return;
  hint.classList.remove('active');
  void hint.offsetWidth;
  hint.classList.add('active');
  setTimeout(() => hint.classList.remove('active'), 550);
}

function handleStageTap(clientX, clientY) {
  const now = Date.now();
  const zone = getTapZone(clientX, clientY);
  const isDoubleTap = (now - lastTapTime < 320)
    && Math.hypot(clientX - lastTapX, clientY - lastTapY) <= 48;
  lastTapTime = now;
  lastTapX = clientX;
  lastTapY = clientY;

  if (isDoubleTap) {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    // Consume the pair. A third rapid tap starts a new gesture instead of
    // chaining against the second tap and toggling the favorite repeatedly.
    lastTapTime = 0;
    lastTapX = 0;
    lastTapY = 0;
    const rect = el.mediaStage.getBoundingClientRect();
    const doubleTapAction = resolveMediaDoubleTapAction(clientX, rect.left, rect.width, !el.videoPlayer?.hidden);
    // Preserve the established ±10s shortcut only in the narrow outer edges;
    // the rest of the media surface follows the familiar double-tap-to-like pattern.
    if (doubleTapAction === 'seek-backward' || doubleTapAction === 'seek-forward') {
      const seekZone = doubleTapAction === 'seek-backward' ? 'left' : 'right';
      seekRelative(seekZone === 'left' ? -10 : 10);
      flashSeekHint(seekZone);
    } else {
      toggleFavoriteForSelected({ showFeedback: true });
      navigator.vibrate?.(10);
    }
    return;
  }

  // Any non-control surface can receive the second tap, so defer the single
  // tap action by only the recognition window. Center toggles playback;
  // the surrounding surface toggles the immersive chrome.
  if (singleTapTimer) clearTimeout(singleTapTimer);
  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    if (zone === 'center') togglePlayPause();
    else setStageImmersive(!el.playerModal.classList.contains('immersive'));
  }, 280);
}

function setupTouchGestures() {
  const modal = el.playerModal || el.mediaStage;
  if (!modal) return;

  modal.addEventListener('touchstart', (e) => {
    if (state.mediaAttempt.startsWith('drive-preview')) return;
    if (mediaTransitionCommitting || swipeCommitPending) {
      e.preventDefault();
      return;
    }
    if (e.touches.length !== 1) {
      cancelActiveTouchGesture();
      return;
    }
    // Don't hijack interaction on buttons, sliders, or seekbar
    if (e.target.closest('.seek-bar-container, .mobile-shorts-progress-track, .speed-dropdown, .volume-slider, .volume-slider-wrap, button, input, select')) return;

    clearMediaTransition();
    const activeEl = getActiveMediaElement();
    if (activeEl) {
      activeEl.style.transform = '';
      activeEl.className = activeEl.className.replace(/\banim-slide-[a-z-]+\b/g, '').trim();
    }
    el.mediaStage?.classList.remove('is-snapping');
    if (snapBackTimer) clearTimeout(snapBackTimer);
    snapBackTimer = null;
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    swipeStageWidth = el.mediaStage?.clientWidth || window.innerWidth || 400;
    swipeStageHeight = el.mediaStage?.clientHeight || window.innerHeight || 600;
    isTouchActive = true;
    lockedAxis = null;
    swipeGestureDirection = null;
    swipeGestureTargetId = null;
    swipeGestureAwaitingPopulation = false;
  }, { passive: false });

  modal.addEventListener('touchmove', (e) => {
    if (!isTouchActive) return;
    if (e.touches.length !== 1) {
      cancelActiveTouchGesture();
      return;
    }
    const rawX = e.touches[0].clientX - touchStartX;
    const rawY = e.touches[0].clientY - touchStartY;
    
    // Lock only after a deliberate, clearly dominant direction emerges.
    if (lockedAxis === null) {
      const absX = Math.abs(rawX);
      const absY = Math.abs(rawY);
      if (Math.hypot(absX, absY) >= 12) {
        if (absX >= Math.max(1, absY) * 1.25) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
          lastTapTime = 0;
          lockedAxis = 'x';
          swipeGestureDirection = rawX < 0 ? 'left' : 'right';
          swipeGestureTargetId = resolveSwipeTarget(swipeGestureDirection)?.id || null;
        } else if (absY >= Math.max(1, absX) * 1.25) {
          clearTimeout(singleTapTimer);
          singleTapTimer = null;
          lastTapTime = 0;
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
    if (!isTouchActive || e.changedTouches.length !== 1) return;
    isTouchActive = false;
    el.mediaStage?.classList.remove('is-dragging');

    const activeEl = getActiveMediaElement();
    const rawDiffX = e.changedTouches[0].clientX - touchStartX;
    const rawDiffY = e.changedTouches[0].clientY - touchStartY;
    const elapsed = Math.max(1, Date.now() - touchStartTime);

    // Tap (no axis locked, short duration, minimal movement) — shorts-style
    // double-tap seek on edges, single tap toggles playback. preventDefault
    // stops the synthetic click so onMediaStageClick never double-fires.
    if (lockedAxis === null && elapsed < 300 && Math.abs(rawDiffX) < 10 && Math.abs(rawDiffY) < 10) {
      e.preventDefault();
      handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      lockedAxis = null;
      swipeGestureDirection = null;
      swipeGestureTargetId = null;
      swipeGestureAwaitingPopulation = false;
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
    lockedAxis = null;
    swipeGestureDirection = null;
    swipeGestureTargetId = null;
    swipeGestureAwaitingPopulation = false;
  }, { passive: false });

  modal.addEventListener('touchcancel', cancelActiveTouchGesture, { passive: true });
}

function cancelActiveTouchGesture() {
  if (!isTouchActive) return;
  isTouchActive = false;
  lockedAxis = null;
  swipeGestureDirection = null;
  swipeGestureTargetId = null;
  swipeGestureAwaitingPopulation = false;
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
  if (el.playerSheet.hidden) return;
  if (document.querySelector('dialog[open]')) return;
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

  const key = event.key.toLowerCase();
  const code = event.code;

  if (event.key === 'Escape') {
    if (isPlayerMoreOpen) {
      event.preventDefault();
      if (el.playerMoreMenu) el.playerMoreMenu.open = false;
      isPlayerMoreOpen = false;
      resetControlsTimer();
      return;
    }
    if (isSpeedMenuOpen) {
      isSpeedMenuOpen = false;
      if (el.speedDropdown) el.speedDropdown.hidden = true;
      el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
      return;
    }
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      closePlayer();
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
      showPlayerFeedback(`VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      el.videoPlayer.volume = Math.max(0, +(el.videoPlayer.volume - 0.1).toFixed(2));
      showPlayerFeedback(`VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (code && code.startsWith('Digit') && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const digit = Number(code.replace('Digit', ''));
      if (!isNaN(digit) && el.videoPlayer.duration) {
        event.preventDefault();
        el.videoPlayer.currentTime = (digit / 10) * el.videoPlayer.duration;
        showPlayerFeedback(`SEEK ${digit * 10}%`);
        updateVideoProgress();
      }
    }
  }
}

function setNativeVideoActionsAvailable(available) {
  const enabled = Boolean(available);
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.shortsPipBtn) el.shortsPipBtn.hidden = !document.pictureInPictureEnabled || !enabled;
  updateFrameStepVisibility(enabled && Boolean(el.videoPlayer?.paused));
  if (el.shortsRotateBtn) el.shortsRotateBtn.hidden = !enabled;
}

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
    time: Number.isFinite(video.currentTime) ? video.currentTime : 0,
    paused: Boolean(video.paused),
    volume: Number.isFinite(video.volume) ? video.volume : 1,
    muted: Boolean(video.muted),
    playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
    fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
    decoded: state.mediaDecodeVerified === true
  };
}

function restorePlaybackSnapshot(video, snapshot, session) {
  if (!video || !snapshot) return;
  if (snapshot.decoded) state.mediaDecodeVerified = true;
  video.volume = snapshot.volume;
  video.muted = snapshot.muted;
  video.playbackRate = snapshot.playbackRate;
  video.addEventListener('loadedmetadata', () => {
    if (state.mediaSession !== session || !isCurrentMediaEvent(video)) return;
    if (snapshot.time > 0) video.currentTime = Math.min(video.duration || snapshot.time, snapshot.time);
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
  state.selected = file;
  if (!state.playbackOrderIds.includes(file.id)) state.playbackOrderIds.push(file.id);
  if (state.playbackDeck?.anchorId !== file.id) {
    state.playbackDeck = buildAccountPlaybackDeck(getPlaybackFileList(), file.id);
    state.playbackDeckComplete = hasCompletePlaybackPopulation();
  }
  markFileViewed(file.id);
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

  resetMediaElements();
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
  updateQualityDisplay();
  showMediaLoading('원본 재생 경로 확인 중');

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

async function startInitialOriginalPlayback(file, kind, session) {
  if (!file || state.selected?.id !== file.id || state.mediaSession !== session) return;
  if (kind !== 'video') {
    startOriginalRangePlayback(file, kind, session);
    return;
  }

  state.mediaAttempt = 'buffer-evaluating';
  showMediaLoading('원본 임시 디스크 사용 가능 여부 확인 중');
  const policy = await resolveOriginalBufferPolicy(file);
  if (state.selected?.id !== file.id || state.mediaSession !== session) return;
  const route = chooseInitialOriginalPlaybackRoute({ isVideo: true, policy });
  if (route === PLAYBACK_MODE.OPFS) {
    await startOriginalBlobFallback(file, kind, session, {
      confirmed: true,
      policy,
      rangeFallbackOnFailure: true
    });
    return;
  }
  startOriginalRangePlayback(file, kind, session);
}

function startOriginalRangePlayback(file, kind, session, message = 'Drive 원본 구간 스트림 준비 중') {
  if (!file || state.selected?.id !== file.id || state.mediaSession !== session) return false;
  state.mediaAttempt = 'range';
  state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
  state.mediaTransportVerified = false;
  state.mediaRangeIntegrity = 'unknown';
  state.lastProxyError = null;
  updateQualityDisplay();
  showMediaLoading(message);
  sendTokenToWorker();
  const mediaUrl = buildMediaUrl(file);

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
        el.videoPlayer.currentTime = Math.min(el.videoPlayer.duration || resume, resume);
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

  window.setTimeout(() => {
    if (session === state.mediaSession && state.mediaAttempt === 'range' && !el.mediaLoading.hidden) {
      el.mediaLoadingText.textContent = '원본 응답을 기다리는 중입니다…';
    }
  }, 5000);
  return true;
}

async function attemptCurrentPlayback(session) {
  try {
    await el.videoPlayer.play();
    if (session === state.mediaSession) state.pendingPlay = false;
  } catch (error) {
    if (session !== state.mediaSession) return;
    state.pendingPlay = false;
    if (error?.name === 'NotAllowedError') {
      showPlayerFeedback('화면을 눌러 재생');
      updatePlayPauseUI();
      return;
    }
    if (error?.name !== 'AbortError') console.warn('Immediate playback was not available:', error);
  }
}

function buildMediaUrl(file) {
  const base = new URL('.', location.href);
  const url = new URL(`__drive_media/${encodeURIComponent(file.id)}`, base);
  if (file.mimeType) url.searchParams.set('mime', file.mimeType);
  if (file.size) url.searchParams.set('size', file.size);
  if (file.resourceKey) url.searchParams.set('resourceKey', file.resourceKey);
  url.searchParams.set('mediaSession', String(state.mediaSession));
  if (state.mediaRetryCount) url.searchParams.set('attempt', String(state.mediaRetryCount));
  if (state.mediaAbuseAcknowledged && state.selected?.id === file.id) {
    url.searchParams.set('acknowledgeAbuse', '1');
  }
  return url.href;
}

function onSeekKeyDown(event) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const duration = el.videoPlayer.duration || 0;
  if (!duration) return;
  let target = null;
  if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') target = el.videoPlayer.currentTime - 5;
  if (event.key === 'ArrowRight' || event.key === 'ArrowUp') target = el.videoPlayer.currentTime + 5;
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = duration;
  if (target == null) return;
  event.preventDefault();
  el.videoPlayer.currentTime = Math.max(0, Math.min(duration, target));
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

async function handleMediaElementError(kind) {
  const element = kind === 'video' ? el.videoPlayer : el.imageViewer;
  if (!element.getAttribute('src') || !state.selected) return;
  if (
    state.mediaAttempt === 'blob-loading' || state.mediaAttempt === 'buffer-evaluating'
    || state.mediaAttempt === 'auth-refresh' || state.mediaAttempt === 'retry-wait'
    || state.mediaAttempt.startsWith('drive-preview')
  ) return;

  const file = state.selected;
  const session = state.mediaSession;
  const attempt = state.mediaAttempt;
  const mediaErrorCode = Number(element.error?.code) || 0;

  // The media element and service worker report the same failure on separate
  // queues. Give the classified HTTP error a brief chance to arrive first so
  // a 401/403/429/5xx response is not mislabeled as an unsupported codec.
  await new Promise((resolve) => window.setTimeout(resolve, MEDIA_ERROR_CLASSIFY_DELAY_MS));
  if (
    state.selected?.id !== file.id || state.mediaSession !== session
    || state.mediaAttempt !== attempt
  ) return;

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
      await startOriginalBlobFallback(file, kind, session);
    } else if (mediaErrorCode === 4) {
      const unsupportedAction = decideUnsupportedFormatRecovery({
        retryCount: state.mediaRetryCount,
        transportVerified: state.mediaTransportVerified,
        playbackMode: state.mediaPlaybackMode,
        decodeVerified: state.mediaDecodeVerified
      });
      if (unsupportedAction === 'retry-range') {
        retryOriginalStream(file, session, '원본 응답을 다시 검증한 뒤 형식 호환성을 확인하는 중');
      } else if (unsupportedAction === 'compatibility') {
        showDrivePreview(file, describeVideoPlaybackFailure(mediaErrorCode));
      } else {
        state.mediaAttempt = 'buffer-evaluating';
        await offerOriginalBufferFallback(file, kind, session, describeVideoPlaybackFailure(mediaErrorCode));
      }
    } else if (mediaErrorCode === 3 && state.mediaRangeIntegrity === 'valid' && state.mediaRetryCount < 1) {
      retryOriginalStream(file, session, '검증된 원본 스트림을 새로 만들어 다시 연결하는 중');
    } else if ((mediaErrorCode === 1 || mediaErrorCode === 2) && state.mediaRetryCount < 1) {
      retryOriginalStream(file, session, '원본 스트림 연결이 끊겨 자동으로 다시 연결하는 중');
    } else if ([0, 1, 2, 3].includes(mediaErrorCode)) {
      state.mediaAttempt = 'buffer-evaluating';
      await offerOriginalBufferFallback(file, kind, session, describeVideoPlaybackFailure(mediaErrorCode));
    } else {
      state.mediaAttempt = 'buffer-evaluating';
      await offerOriginalBufferFallback(file, kind, session, describeVideoPlaybackFailure(mediaErrorCode));
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
  clearTimeout(mediaRecoveryTimer);
  state.mediaAttempt = 'retry-wait';
  showMediaLoading(message);
  mediaRecoveryTimer = window.setTimeout(() => {
    mediaRecoveryTimer = null;
    retryOriginalStream(file, expectedSession, '원본 스트림 자동 재연결 중');
  }, delayMs);
}

function retryOriginalStream(file, expectedSession, message, { consumeRetry = true } = {}) {
  if (
    !file || !file.mimeType?.startsWith('video/') || state.selected?.id !== file.id
    || state.mediaSession !== expectedSession || (consumeRetry && state.mediaRetryCount >= 1)
  ) return false;

  const snapshot = state.resumePosition?.fileId === file.id && state.resumePosition.snapshot
    ? state.resumePosition.snapshot
    : capturePlaybackSnapshot();
  if (state.resumePosition?.fileId === file.id) state.resumePosition = null;
  state.mediaSession += 1;
  if (consumeRetry) state.mediaRetryCount += 1;
  state.lastProxyError = null;
  state.mediaAttempt = 'range-retry';
  state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
  state.mediaTransportVerified = false;
  state.mediaRangeIntegrity = 'unknown';
  const retrySession = state.mediaSession;

  clearDirectMediaSources();
  setNativeVideoActionsAvailable(true);
  const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
  if (poster) {
    el.videoPlayer.poster = poster;
    el.videoPlayer.classList.add('has-poster');
  }
  updateQualityDisplay();
  showMediaLoading(message);
  sendTokenToWorker();

  el.videoPlayer.hidden = false;
  el.videoPlayer.dataset.mediaSession = String(retrySession);
  el.videoPlayer.src = buildMediaUrl(file);
  restorePlaybackSnapshot(el.videoPlayer, snapshot, retrySession);
  el.videoPlayer.load();
  if (!snapshot || !snapshot.paused) {
    state.pendingPlay = true;
    attemptCurrentPlayback(retrySession);
  }
  return true;
}

async function supportsWritableOpfs() {
  if (!navigator.storage?.getDirectory) return false;
  if (writableOpfsSupportPromise) return writableOpfsSupportPromise;
  writableOpfsSupportPromise = (async () => {
    let directory = null;
    let name = '';
    try {
      const root = await navigator.storage.getDirectory();
      directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY, { create: true });
      const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      name = `media-capability-${randomPart}.tmp`;
      const handle = await directory.getFileHandle(name, { create: true });
      return typeof handle.createWritable === 'function';
    } catch (_) {
      return false;
    } finally {
      if (directory && name) await directory.removeEntry(name).catch(() => {});
    }
  })();
  return writableOpfsSupportPromise;
}

async function resolveOriginalBufferPolicy(file) {
  let storageAvailable = 0;
  const opfsAvailable = !state.mediaExhaustedOriginalModes.has(PLAYBACK_MODE.OPFS)
    && await supportsWritableOpfs();
  if (opfsAvailable && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageAvailable = Math.max(0, Number(estimate?.quota || 0) - Number(estimate?.usage || 0));
    } catch (_) {}
  }
  return getOriginalBufferPolicy({
    size: file?.size,
    mobile: isMobileDevice(),
    opfsAvailable,
    storageAvailable
  });
}

async function offerOriginalBufferFallback(file, kind, session, reason) {
  if (!file || state.selected?.id !== file.id || session !== state.mediaSession) return;
  const policy = await resolveOriginalBufferPolicy(file);
  if (state.selected?.id !== file.id || session !== state.mediaSession) return;
  if (policy.decision === 'auto') {
    await startOriginalBlobFallback(file, kind, session, { confirmed: true, policy });
    return;
  }
  if (policy.decision === 'denied') {
    showDrivePreview(file, `${reason} 원본 전체 임시 저장도 이 기기의 안전 한도를 넘어`);
    return;
  }
  state.mediaAttempt = 'buffer-choice';
  state.pendingOriginalBuffer = { fileId: file.id, kind, session, reason, policy };
  const locationLabel = policy.mode === 'disk' ? '앱 전용 임시 디스크' : '메모리';
  const sizeLabel = Number(file.size) > 0 ? formatBytes(Number(file.size)) : '크기 미확인';
  showMediaError(
    `${reason} ${sizeLabel} 원본 전체를 ${locationLabel}에 먼저 저장하면 화질 손실 없이 재생할 수 있습니다. 저장 완료 전까지 기다려야 하며, 다음 파일로 이동하면 즉시 삭제됩니다.`,
    { title: '원본 화질을 유지할까요?', showRetry: false }
  );
  el.bufferOriginalButton.hidden = false;
  el.compatPlayerButton.hidden = false;
}

function confirmOriginalBufferFallback() {
  const pending = state.pendingOriginalBuffer;
  if (!pending || state.selected?.id !== pending.fileId || state.mediaSession !== pending.session) return;
  startOriginalBlobFallback(state.selected, pending.kind, pending.session, {
    confirmed: true,
    policy: pending.policy
  });
}

function confirmPendingMediaAction() {
  const pendingSecurity = state.pendingSecurityConfirmation;
  if (pendingSecurity) {
    if (state.selected?.id !== pendingSecurity.fileId || state.mediaSession !== pendingSecurity.session) return;
    state.pendingSecurityConfirmation = null;
    state.mediaAbuseAcknowledged = true;
    el.bufferOriginalButton.textContent = '원본 전체 임시 저장';
    if (pendingSecurity.stage === 'full') {
      state.mediaAttempt = 'buffer-evaluating';
      startOriginalBlobFallback(state.selected, pendingSecurity.kind, pendingSecurity.session, {
        confirmed: true,
        policy: pendingSecurity.policy,
        rangeFallbackOnFailure: pendingSecurity.rangeFallbackOnFailure === true
      });
    } else {
      retryOriginalStream(
        state.selected,
        pendingSecurity.session,
        '보안 경고 확인 완료 — 원본 스트림 다시 연결 중',
        { consumeRetry: false }
      );
    }
    return;
  }
  confirmOriginalBufferFallback();
}

function isOriginalTransferRateLimit(error) {
  return Number(error?.status) === 429
    || (Number(error?.status) === 403
      && (error?.reasons || []).some((reason) => /rateLimitExceeded/i.test(String(reason || ''))));
}

async function downloadOriginalFile(file, session, policy, signal) {
  const headers = {};
  if (file.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${file.id}/${file.resourceKey}`;
  let lastError = null;

  while (state.mediaFullRequestCount < 3) {
    const attempt = state.mediaFullRequestCount;
    state.mediaFullRequestCount += 1;
    if (signal?.aborted || session !== state.mediaSession || state.selected?.id !== file.id) {
      throw new DOMException('Media session changed', 'AbortError');
    }
    try {
      const response = await fetchOriginalFileResponse(file, { headers, signal });
      const contentLength = Number(response.headers.get('Content-Length')) || 0;
      const metadataSize = Number(file.size) || 0;
      if (response.status !== 200) {
        await response.body?.cancel();
        throw new Error(`Unexpected full-original status ${response.status}`);
      }
      if (metadataSize && contentLength && metadataSize !== contentLength) {
        await response.body?.cancel();
        throw new Error(`Original Content-Length mismatch (${contentLength}/${metadataSize})`);
      }
      if (contentLength && contentLength > policy.hardLimit) {
        await response.body?.cancel();
        throw new RangeError('Original file exceeds the temporary buffer limit');
      }
      const originalFile = policy.mode === 'disk'
        ? await writeResponseIntoOpfs(response, file, session, policy.hardLimit)
        : await readResponseIntoBlob(response, file, session, policy.hardLimit);
      if (session !== state.mediaSession || state.selected?.id !== file.id) {
        cleanupOriginalTempStorage();
        throw new DOMException('Media session changed', 'AbortError');
      }
      const expectedSize = metadataSize || contentLength;
      if (expectedSize && originalFile.size !== expectedSize) {
        cleanupOriginalTempStorage();
        throw new Error(`Original byte count mismatch (${originalFile.size}/${expectedSize})`);
      }
      if (!metadataSize && contentLength) file.size = String(contentLength);
      return originalFile;
    } catch (error) {
      lastError = error;
      cleanupOriginalTempStorage();
      const rateLimited = isOriginalTransferRateLimit(error);
      const nonRetryable = error?.name === 'AbortError'
        || session !== state.mediaSession
        || state.selected?.id !== file.id
        || isDriveSecurityRestriction(error)
        || isLocalOriginalStorageError(error)
        || error instanceof RangeError
        || [401, 404].includes(Number(error?.status))
        || (Number(error?.status) === 403 && !rateLimited);
      if (nonRetryable || state.mediaFullRequestCount >= 3) throw error;
      const delayMs = Math.min(
        MAX_ORIGINAL_RETRY_AFTER_MS,
        Math.max(250, Number(error?.retryAfterMs) || 500 * (2 ** attempt))
      );
      await waitForRetry(delayMs, signal);
    }
  }
  throw lastError || new Error('Original file transfer retry budget exhausted');
}

async function startOriginalBlobFallback(
  file,
  kind,
  session,
  { confirmed = false, policy = null, rangeFallbackOnFailure = false } = {}
) {
  const resolvedPolicy = policy || await resolveOriginalBufferPolicy(file);
  if (session !== state.mediaSession || state.selected?.id !== file.id) return;
  if (resolvedPolicy.decision === 'denied') {
    showDrivePreview(file, '원본 전체 임시 저장 크기가 이 기기의 안전 한도를 넘어');
    return;
  }
  if (resolvedPolicy.decision === 'confirm' && !confirmed) {
    await offerOriginalBufferFallback(file, kind, session, '원본 구간 스트림을 이어가지 못해');
    return;
  }

  const playbackSnapshot = kind === 'video'
    ? (state.resumePosition?.fileId === file.id && state.resumePosition.snapshot
        ? state.resumePosition.snapshot
        : capturePlaybackSnapshot())
    : null;
  state.mediaAttempt = 'blob-loading';
  state.mediaBufferStorageMode = resolvedPolicy.mode;
  state.mediaPlaybackMode = resolvedPolicy.mode === 'disk' ? PLAYBACK_MODE.OPFS : PLAYBACK_MODE.MEMORY;
  state.mediaTransportVerified = false;
  state.pendingOriginalBuffer = null;
  state.lastProxyError = null;
  updateQualityDisplay();
  clearDirectMediaSources();
  if (kind === 'video') {
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
    if (poster) {
      el.videoPlayer.poster = poster;
      el.videoPlayer.classList.add('has-poster');
    }
    el.videoPlayer.hidden = false;
    el.videoPlayer.dataset.mediaSession = String(session);
  }
  const locationLabel = resolvedPolicy.mode === 'disk' ? '앱 전용 임시 디스크' : '메모리';
  showMediaLoading(rangeFallbackOnFailure
    ? `Drive 원본 파일을 ${locationLabel}에 준비하는 중`
    : `직접 스트림 복구 중 — 원본을 ${locationLabel}에 임시 저장하는 중`);
  const bufferController = new AbortController();
  state.mediaAbortController = bufferController;

  try {
    const originalFile = await downloadOriginalFile(
      file,
      session,
      resolvedPolicy,
      bufferController.signal
    );
    if (session !== state.mediaSession || state.selected?.id !== file.id) {
      cleanupOriginalTempStorage();
      return;
    }

    state.mediaBlobUrl = URL.createObjectURL(originalFile);
    state.mediaAttempt = 'blob';
    state.mediaTransportVerified = true;
    updateQualityDisplay();
    el.codecNote.textContent = `Drive 원본 파일 바이트를 ${locationLabel}에 임시 저장해 재인코딩 없이 재생 중입니다. 플레이어를 닫거나 이동하면 즉시 삭제됩니다.`;

    if (kind === 'video') {
      el.videoPlayer.hidden = false;
      el.videoPlayer.dataset.mediaSession = String(session);
      el.videoPlayer.src = state.mediaBlobUrl;
      restorePlaybackSnapshot(el.videoPlayer, playbackSnapshot, session);
      el.videoPlayer.load();
      if (!playbackSnapshot || !playbackSnapshot.paused) {
        state.pendingPlay = true;
        attemptCurrentPlayback(session);
      }
    } else {
      el.imageViewer.hidden = false;
      el.imageViewer.dataset.mediaSession = String(session);
      el.imageViewer.alt = file.name || '원본 이미지';
      el.imageViewer.src = state.mediaBlobUrl;
    }
  } catch (error) {
    if (error.name === 'AbortError' || session !== state.mediaSession) return;
    console.error('Original buffer fallback failed', error);
    cleanupOriginalTempStorage();
    if (rangeFallbackOnFailure && resolvedPolicy.mode === 'disk' && isLocalOriginalStorageError(error)) {
      state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      startOriginalRangePlayback(file, kind, session, '임시 디스크를 사용할 수 없어 Drive 원본 스트림으로 연결 중');
      return;
    }
    if (resolvedPolicy.mode === 'disk' && isLocalOriginalStorageError(error)) {
      state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      const memoryPolicy = getOriginalBufferPolicy({
        size: file.size,
        mobile: isMobileDevice(),
        opfsAvailable: false
      });
      if (memoryPolicy.decision === 'auto') {
        await startOriginalBlobFallback(file, kind, session, {
          confirmed: true,
          policy: memoryPolicy
        });
        return;
      }
      if (memoryPolicy.decision === 'confirm') {
        state.mediaAttempt = 'buffer-choice';
        state.pendingOriginalBuffer = {
          fileId: file.id,
          kind,
          session,
          reason: '임시 디스크 저장을 완료하지 못해',
          policy: memoryPolicy
        };
        const sizeLabel = Number(file.size) > 0 ? formatBytes(Number(file.size)) : '크기 미확인';
        showMediaError(
          `임시 디스크 저장을 완료하지 못했습니다. ${sizeLabel} 원본을 제한된 메모리에 저장해 다시 시도할 수 있습니다.`,
          { title: '메모리 원본 재생으로 전환할까요?', showRetry: false }
        );
        el.bufferOriginalButton.textContent = '메모리에 원본 저장';
        el.bufferOriginalButton.hidden = false;
        el.compatPlayerButton.hidden = false;
        return;
      }
    }
    if (isDriveSecurityRestriction(error) && !state.mediaAbuseAcknowledged) {
      state.mediaAttempt = 'security-confirmation';
      state.pendingSecurityConfirmation = {
        fileId: file.id,
        session,
        stage: 'full',
        kind,
        policy: resolvedPolicy,
        rangeFallbackOnFailure
      };
      showMediaError(
        'Google Drive가 이 파일을 악성코드·바이러스 또는 악용 가능성이 있는 파일로 표시했습니다. 위험을 이해하고 직접 선택한 경우에만 원본 다운로드를 다시 시도합니다.',
        { title: '보안 경고가 있는 원본 파일', showRetry: false }
      );
      el.bufferOriginalButton.textContent = '위험을 이해하고 원본 재시도';
      el.bufferOriginalButton.hidden = false;
    } else if (error.status === 401) {
      clearToken(true);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (classifyMediaProxyFailure(error) === 'permission') {
      if (state.mediaPermissionRetryCount < 1) {
        state.mediaPermissionRetryCount += 1;
        if (playbackSnapshot) {
          state.resumePosition = { fileId: file.id, time: playbackSnapshot.time, snapshot: playbackSnapshot };
        }
        state.mediaAttempt = 'auth-refresh';
        showMediaLoading('Drive 원본 권한을 다시 확인하는 중');
        const refreshed = state.clientId && validateClientId(state.clientId)
          ? await requestGoogleToken({ background: true, force: true })
          : false;
        if (session !== state.mediaSession || state.selected?.id !== file.id) return;
        if (refreshed) {
          state.mediaAttempt = 'buffer-evaluating';
          await startOriginalBlobFallback(file, kind, session, {
            confirmed: true,
            policy: resolvedPolicy,
            rangeFallbackOnFailure
          });
          return;
        }
      }
      clearToken(true);
      state.mediaAttempt = 'failed';
      showMediaError(
        '현재 Google 계정 또는 OAuth 권한으로는 원본 파일을 읽을 수 없습니다. 다시 시도를 눌러 계정 권한을 직접 확인해 주세요.',
        { title: 'Google Drive 권한 확인 필요' }
      );
      updateConnectionBadge();
    } else if (classifyMediaProxyFailure(error) === 'download-restricted') {
      showDrivePreview(file, '원본 다운로드가 제한되어');
    } else if (rangeFallbackOnFailure) {
      if (resolvedPolicy.mode === 'disk') state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      startOriginalRangePlayback(file, kind, session, '임시 디스크 전송을 완료하지 못해 Drive 원본 스트림으로 연결 중');
    } else if (error instanceof RangeError || /byte count mismatch/i.test(error.message || '')) {
      showDrivePreview(file, '원본 전체 임시 저장을 안전하게 완료하지 못해');
    } else {
      showDrivePreview(file, '원본 전체 전송을 완료하지 못해');
    }
  } finally {
    if (state.mediaAbortController === bufferController) state.mediaAbortController = null;
  }
}

function updateOriginalBufferProgress(received, total, storageMode) {
  const now = performance.now();
  if (now - updateOriginalBufferProgress.lastUpdate < 180) return;
  const progress = total ? ` ${Math.min(100, Math.round((received / total) * 100))}%` : '';
  const label = storageMode === 'disk' ? '원본 임시 디스크' : '원본 메모리 버퍼';
  el.mediaLoadingText.textContent = `${label} ${formatBytes(received)}${progress}`;
  updateOriginalBufferProgress.lastUpdate = now;
}
updateOriginalBufferProgress.lastUpdate = 0;

async function readResponseIntoBlob(response, file, session, hardLimit) {
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  if (!response.body?.getReader) {
    throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (session !== state.mediaSession) {
      await reader.cancel();
      throw new DOMException('Media session changed', 'AbortError');
    }
    received += value.byteLength;
    if (received > hardLimit) {
      await reader.cancel();
      throw new RangeError('Original file exceeds the memory buffer limit');
    }
    chunks.push(value);
    updateOriginalBufferProgress(received, total, 'memory');
  }
  return new Blob(chunks, { type: file.mimeType || response.headers.get('Content-Type') || 'application/octet-stream' });
}

async function writeResponseIntoOpfs(response, file, session, hardLimit) {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY, { create: true });
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceExtension = /\.([A-Za-z0-9]{1,8})$/.exec(String(file.name || ''))?.[1];
  const mimeExtension = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif'
  }[String(file.mimeType || '').toLowerCase()];
  const extension = String(sourceExtension || mimeExtension || 'bin').toLowerCase();
  const name = `media-${session}-${randomPart}.${extension}`;
  const handle = await directory.getFileHandle(name, { create: true });
  if (typeof handle.createWritable !== 'function') {
    await directory.removeEntry(name).catch(() => {});
    throw new DOMException('Writable OPFS is unavailable', 'NotSupportedError');
  }
  const writable = await handle.createWritable();
  const reader = response.body?.getReader();
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  let received = 0;
  try {
    if (!reader) {
      throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (session !== state.mediaSession) {
          await reader.cancel();
          throw new DOMException('Media session changed', 'AbortError');
        }
        received += value.byteLength;
        if (received > hardLimit) {
          await reader.cancel();
          throw new RangeError('Original file exceeds temporary storage');
        }
        await writable.write(value);
        updateOriginalBufferProgress(received, total, 'disk');
      }
    }
    await writable.close();
    if (session !== state.mediaSession || state.selected?.id !== file.id) {
      await directory.removeEntry(name).catch(() => {});
      throw new DOMException('Media session changed', 'AbortError');
    }
    const storedFile = await handle.getFile();
    if (session !== state.mediaSession || state.selected?.id !== file.id) {
      await directory.removeEntry(name).catch(() => {});
      throw new DOMException('Media session changed', 'AbortError');
    }
    state.mediaTempStorage = { directory, name };
    return storedFile;
  } catch (error) {
    try { await reader?.cancel(error); } catch (_) {}
    try { await writable.abort(error); } catch (_) {}
    try { await directory.removeEntry(name); } catch (_) {}
    throw error;
  }
}

function cleanupOriginalTempStorage() {
  const temporary = state.mediaTempStorage;
  state.mediaTempStorage = null;
  if (temporary?.directory && temporary.name) {
    temporary.directory.removeEntry(temporary.name).catch(() => {});
  }
}

async function cleanupStaleOriginalBuffers() {
  if (!navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY);
    for await (const name of directory.keys()) {
      if (String(name).startsWith('media-')) await directory.removeEntry(name).catch(() => {});
    }
  } catch (_) {
    // The app-owned temporary directory does not exist yet or storage is unavailable.
  }
}

function clearDrivePreviewTimers() {
  clearTimeout(drivePreviewSlowTimer);
  clearTimeout(drivePreviewTimeoutTimer);
  drivePreviewSlowTimer = null;
  drivePreviewTimeoutTimer = null;
}

function clearDrivePreview() {
  clearDrivePreviewTimers();
  if (el.drivePreview) {
    el.drivePreview.hidden = true;
    el.drivePreview.classList.remove('is-ready');
    delete el.drivePreview.dataset.mediaSession;
    if (el.drivePreview.getAttribute('src') && el.drivePreview.getAttribute('src') !== 'about:blank') {
      el.drivePreview.src = 'about:blank';
    }
  }
  if (el.drivePreviewActions) el.drivePreviewActions.hidden = true;
  el.mediaStage?.classList.remove('drive-preview-active');
  el.playerModal?.classList.remove('drive-preview-mode');
}

function showDrivePreview(file, reason) {
  if (!file || state.selected?.id !== file.id) return;
  clearTimeout(mediaRecoveryTimer);
  mediaRecoveryTimer = null;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  clearDrivePreview();
  state.mediaSession += 1;
  const previewSession = state.mediaSession;
  state.mediaAttempt = 'drive-preview-loading';
  state.mediaPlaybackMode = PLAYBACK_MODE.COMPATIBILITY;
  state.mediaTransportVerified = false;
  state.lastProxyError = null;
  state.pendingPlay = false;
  state.pendingOriginalBuffer = null;
  state.drivePreviewReason = reason;

  setNativeVideoActionsAvailable(false);
  updatePlayPauseUI();
  clearTimeout(controlsHideTimer);
  el.playerModal?.classList.remove('controls-idle', 'immersive', 'media-recovery-mode');
  el.mediaStage?.classList.add('drive-preview-active');
  el.playerModal?.classList.add('drive-preview-mode');
  if (el.drivePreviewActions) el.drivePreviewActions.hidden = false;
  showMediaLoading('Drive Original 안에서 호환 재생기를 준비하는 중');

  el.drivePreview.title = `${file.name || '미디어'} · Google Drive 호환 재생기`;
  el.drivePreview.dataset.mediaSession = String(previewSession);
  el.drivePreview.hidden = false;
  el.drivePreview.src = buildDrivePreviewUrl(file);
  el.codecNote.textContent = `${reason} Drive Original 안의 Google 호환 재생기로 자동 전환했습니다. Google 변환본은 원본보다 해상도가 낮을 수 있습니다.`;
  showToast(/제한/.test(reason)
    ? 'Drive 원본 다운로드가 제한되어 Google 호환 재생으로 전환했습니다.'
    : '원본 재생 경로를 모두 시도한 뒤 Google 호환 재생으로 전환했습니다.');
  updateQualityDisplay();

  drivePreviewSlowTimer = window.setTimeout(() => {
    if (state.mediaSession === previewSession && state.mediaAttempt === 'drive-preview-loading') {
      el.mediaLoadingText.textContent = 'Google에서 재생 가능한 변환본을 준비하는 중입니다…';
    }
  }, DRIVE_PREVIEW_SLOW_MS);
  drivePreviewTimeoutTimer = window.setTimeout(() => {
    if (state.mediaSession === previewSession && state.mediaAttempt === 'drive-preview-loading') {
      handleDrivePreviewFailure();
    }
  }, DRIVE_PREVIEW_TIMEOUT_MS);
}

function handleDrivePreviewLoad(event) {
  const frame = event?.currentTarget || el.drivePreview;
  if (!frame || frame.getAttribute('src') === 'about:blank') return;
  if (!isCurrentMediaEvent(frame) || !state.mediaAttempt.startsWith('drive-preview')) return;
  // A cross-origin iframe load only proves that a page document appeared; it
  // cannot prove video playback, login state, codec support, or final quality.
  // Keep the visible retry/direct-open actions available for the whole session.
  clearDrivePreviewTimers();
  state.mediaAttempt = 'drive-preview-page';
  frame.classList.add('is-ready');
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  hideSwipeNeighbor({ immediate: false });
  updateQualityDisplay();
}

function handleDrivePreviewFailure(event) {
  const frame = event?.currentTarget || el.drivePreview;
  if (frame && frame.dataset?.mediaSession && !isCurrentMediaEvent(frame)) return;
  if (!state.mediaAttempt.startsWith('drive-preview')) return;
  clearDrivePreviewTimers();
  state.mediaAttempt = 'drive-preview-error';
  updateQualityDisplay();
  showMediaError('앱 안의 Google 호환 재생기가 응답하지 않습니다. 먼저 앱 안에서 다시 불러오고, 계속 실패할 때만 Drive 직접 열기를 사용하세요.', {
    title: '호환 재생기 연결 지연',
    showDrive: true,
    showRetry: true
  });
}

function buildDrivePreviewUrl(file) {
  const url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(file?.id || '')}/preview`);
  if (file?.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.href;
}

function buildDriveViewUrl(file) {
  const url = file?.webViewLink
    ? new URL(file.webViewLink)
    : new URL(`https://drive.google.com/file/d/${encodeURIComponent(file?.id || '')}/view`);
  if (file?.resourceKey && !url.searchParams.has('resourcekey')) {
    url.searchParams.set('resourcekey', file.resourceKey);
  }
  return url.href;
}

function openSelectedInDrive() {
  if (!state.selected) return;
  window.open(buildDriveViewUrl(state.selected), '_blank', 'noopener,noreferrer');
}

/* 터치 확인 피드백 — 버튼을 눌렀다는 짧은 시각적 반응.
   :active는 손가락을 떼는 순간 사라져 전달력이 약하므로 별도 플래시를 얹는다. */
function flashPressed(node) {
  if (!node) return;
  node.classList.remove('flash-pressed');
  void node.offsetWidth;
  node.classList.add('flash-pressed');
  setTimeout(() => node.classList.remove('flash-pressed'), 280);
}

/* 진행 중 로딩 표시 — 작업 완료까지의 공백을 스피너+라벨로 채운다. */
function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.classList.add('is-loading');
  } else {
    button.classList.remove('is-loading');
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

function formatActionTarget(files) {
  const items = Array.isArray(files) ? files : [];
  if (items.length <= 1) return items[0]?.name || '이름 없는 파일';
  const firstName = items[0]?.name || '이름 없는 파일';
  return `${items.length.toLocaleString('ko-KR')}개 파일 · ${firstName} 외 ${items.length - 1}개`;
}

function actionFilesSnapshot() {
  return state.pendingActionFiles.length ? [...state.pendingActionFiles] : getActionFiles();
}

function settleSelectionAfterBulk(failedFiles) {
  state.pendingActionFiles = [];
  if (!state.selectionMode) return;
  const failedIds = new Set((failedFiles || []).map((file) => file.id));
  if (!failedIds.size) {
    exitSelectionMode();
    return;
  }
  state.selectedFileIds = failedIds;
  updateSelectionUI();
}

function requestDeleteFile() {
  const files = getActionFiles();
  if (!files.length || state.deleting || state.bulkAction) return;
  state.pendingActionFiles = [...files];
  if (el.deleteDialog && el.deleteFileName) {
    el.deleteFileName.textContent = formatActionTarget(files);
    if (!el.deleteDialog.open) el.deleteDialog.showModal();
  }
}

async function trashDriveFile(file) {
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true })
  });
  await response.json().catch(() => ({}));
}

async function performDeleteFile() {
  const files = actionFilesSnapshot();
  if (!files.length || state.deleting || state.bulkAction) return;
  state.deleting = true;
  state.bulkAction = true;
  updateSelectionUI();
  if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = true;
  setButtonLoading(el.deleteConfirmButton, true, files.length > 1 ? `${files.length}개 삭제 중…` : '삭제 중…');
  try {
    const order = getPlaybackFileList();
    const currentId = state.selected?.id || null;
    const removedIndex = currentId ? order.findIndex((file) => file.id === currentId) : -1;
    const results = await runTaskPool(files, trashDriveFile);
    const succeeded = results.filter((result) => result.status === 'fulfilled').map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const removedIds = new Set(succeeded.map((file) => file.id));

    state.files = state.files.filter((file) => !removedIds.has(file.id));
    markFilesRemovedFromAccountState(removedIds);
    succeeded.forEach((file) => {
      shuffledOrderMap.delete(file.id);
      generatedThumbnailCache.delete(file.id);
    });
    if (state.treeCache) {
      state.treeCache = buildTreeIndexes(state.treeCache.items.filter((file) => !removedIds.has(file.id)));
    }
    if (el.deleteDialog?.open) el.deleteDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();

    settleSelectionAfterBulk(failed.map((result) => result.item));
    if (currentId && removedIds.has(currentId)) playNextAfterRemoval(order, removedIndex, removedIds);

    if (!failed.length) {
      const suffix = state.demo ? ' (데모 시뮬레이션)' : ' Drive 휴지통에서 복구할 수 있습니다.';
      showToast(`${succeeded.length.toLocaleString('ko-KR')}개 파일을 휴지통으로 이동했습니다.${suffix}`);
    } else {
      const firstError = failed[0]?.reason;
      if (failed.some((result) => result.reason?.status === 401)) clearToken(false);
      showToast(`${succeeded.length.toLocaleString('ko-KR')}개 삭제, ${failed.length.toLocaleString('ko-KR')}개 실패: ${humanizeDriveError(firstError)}`);
    }
  } catch (error) {
    console.error('Bulk delete failed', error);
    if (el.deleteDialog?.open) el.deleteDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearToken(false);
    }
    showToast(`삭제하지 못했습니다: ${humanizeDriveError(error)}`);
  } finally {
    state.deleting = false;
    state.bulkAction = false;
    if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = false;
    setButtonLoading(el.deleteConfirmButton, false);
    updateSelectionUI();
  }
}

/* 삭제/이동으로 현재 파일이 목록에서 사라져도 플레이어를 유지하고
   다음 영상을 자동 재생한다. 남은 파일이 없을 때만 플레이어를 닫는다. */
function playNextAfterRemoval(order, removedIndex, removedIdOrIds) {
  if (el.playerSheet.hidden) return;
  const removedIds = removedIdOrIds instanceof Set ? removedIdOrIds : new Set([removedIdOrIds]);
  let next = null;
  for (let i = removedIndex + 1; i < order.length; i++) {
    if (!removedIds.has(order[i].id)) { next = order[i]; break; }
  }
  if (!next) {
    const remaining = order.filter((file) => !removedIds.has(file.id));
    next = remaining[0] || null;
  }
  if (!next) {
    closePlayer();
    return;
  }
  state.pendingPlay = true;
  animateMediaTransition('left', () => openMediaSource(next));
}

/* 폴더 이동 — 전체 폴더 목록을 1회 수집해 순수 폴더명 목록으로 선택 UI 제공 */
async function requestMoveFile() {
  const files = getActionFiles();
  if (!files.length || state.moving || state.bulkAction) return;
  const generation = ++moveRequestGeneration;
  moveParentsAbortController?.abort();
  const parentsController = new AbortController();
  moveParentsAbortController = parentsController;
  state.pendingActionFiles = [...files];
  state.moveTargetFolderId = null;
  state.moveResultLimit = MOVE_RESULT_BATCH;
  if (el.moveFileName) el.moveFileName.textContent = formatActionTarget(files);
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  if (el.moveSearchInput) el.moveSearchInput.value = '';
  if (el.moveDialog && !el.moveDialog.open) el.moveDialog.showModal();
  renderMoveFolderList('');
  try {
    const parentResults = await runTaskPool(files, (file) => ensureFileParents(file, parentsController.signal));
    if (generation !== moveRequestGeneration || parentsController.signal.aborted) {
      throw new DOMException('Move request superseded', 'AbortError');
    }
    const parentFailure = parentResults.find((result) => result.status === 'rejected');
    if (parentFailure) throw parentFailure.reason;
    await ensureFolderIndex();
    if (generation !== moveRequestGeneration || parentsController.signal.aborted) {
      throw new DOMException('Move request superseded', 'AbortError');
    }
    if (el.moveDialog?.open) renderMoveFolderList(el.moveSearchInput?.value || '');
  } catch (error) {
    if (generation !== moveRequestGeneration || parentsController.signal.aborted || error?.name === 'AbortError') return;
    console.error('Move dialog failed', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    state.pendingActionFiles = [];
    if (error?.status === 401) {
      clearToken(false);
      showToast('Google 인증이 만료됐습니다. 다시 시도해 주세요.');
    } else {
      showToast(`폴더 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    if (moveParentsAbortController === parentsController) moveParentsAbortController = null;
  }
}

async function ensureFileParents(file, signal) {
  if (!file) return;
  if (signal?.aborted) throw new DOMException('Move request cancelled', 'AbortError');
  if (Array.isArray(file.parents) && file.parents.length && file.capabilities) return;
  if (state.demo) {
    file.parents = ['root'];
    return;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?fields=parents,driveId,resourceKey,capabilities(canMoveItemOutOfDrive,canMoveItemWithinDrive)&supportsAllDrives=true`, { signal });
  const data = await response.json();
  if (signal?.aborted) throw new DOMException('Move request cancelled', 'AbortError');
  file.parents = Array.isArray(data.parents) && data.parents.length ? data.parents : [state.rootFolderId || 'root'];
  file.driveId = data.driveId || null;
  file.resourceKey = data.resourceKey || file.resourceKey || null;
  file.capabilities = { ...(file.capabilities || {}), ...(data.capabilities || {}) };
}

function cancelMoveFolderLoading() {
  moveRequestGeneration += 1;
  moveParentsAbortController?.abort();
  moveParentsAbortController = null;
  state.folderIndexAbortController?.abort();
  state.folderIndexAbortController = null;
  state.folderIndexPromise = null;
  state.loadingFolderIndex = false;
  state.moveTargetFolderId = null;
  state.pendingActionFiles = [];
}

async function ensureFolderIndex() {
  if (state.folderIndex) return state.folderIndex;
  if (state.folderIndexPromise) return state.folderIndexPromise;
  state.loadingFolderIndex = true;
  const controller = new AbortController();
  state.folderIndexAbortController = controller;
  const promise = (async () => {
   try {
    const rootId = await resolveRootFolderId();
    if (state.demo) {
      await ensureTreeCache();
      const folders = [...(state.treeCache?.foldersById?.values() || [])];
      const roots = [{ id: rootId, name: '내 드라이브', driveId: null, capabilities: { canAddChildren: true } }];
      state.folderIndex = { roots, folders };
      state.moveFolderRows = buildMoveFolderRows(state.folderIndex);
      return state.folderIndex;
    }

    const [rootResponse, sharedDrives] = await Promise.all([
      driveFetch(`${DRIVE_API}/files/root?fields=id,name,driveId,resourceKey,capabilities(canAddChildren)&supportsAllDrives=true`, { signal: controller.signal }),
      collectSharedDriveRoots(controller.signal)
    ]);
    const rootData = await rootResponse.json();
    const root = {
      id: rootData.id || rootId,
      name: '내 드라이브',
      driveId: rootData.driveId || null,
      resourceKey: rootData.resourceKey || null,
      capabilities: rootData.capabilities || { canAddChildren: true }
    };
    const collected = await collectAllPages(async (pageToken) => {
      const params = new URLSearchParams({
        pageSize: String(DRIVE_PAGE_SIZE),
        q: `trashed = false and mimeType = '${FOLDER_MIME}'`,
        spaces: 'drive',
        corpora: 'user',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        fields: 'nextPageToken,incompleteSearch,files(id,name,parents,driveId,resourceKey,capabilities(canAddChildren))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal });
      return response.json();
    }, {
      signal: controller.signal,
      onPage: ({ count }) => {
        if (el.moveFolderList) {
          el.moveFolderList.textContent = `폴더 목록을 불러오는 중… ${count.toLocaleString('ko-KR')}개`;
        }
      }
    });
    if (collected.incompleteSearch) {
      throw new Error('Google Drive가 폴더 검색 결과를 완전하게 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.');
    }
    const sharedDriveFolders = await collectSharedDriveFolders(sharedDrives, controller.signal);
    const roots = [root, ...sharedDrives];
    state.folderIndex = { roots, folders: dedupeFiles([...collected.items, ...sharedDriveFolders]) };
    state.moveFolderRows = buildMoveFolderRows(state.folderIndex);
    return state.folderIndex;
  } finally {
    if (state.folderIndexAbortController === controller) {
      state.loadingFolderIndex = false;
      state.folderIndexAbortController = null;
    }
  }
  })();
  state.folderIndexPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.folderIndexPromise === promise) state.folderIndexPromise = null;
  }
}

async function collectSharedDriveRoots(signal) {
  const collected = await collectAllPages(async (pageToken) => {
    const params = new URLSearchParams({
      pageSize: '100',
      fields: 'nextPageToken,drives(id,name,capabilities(canAddChildren,canListChildren))'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`${DRIVE_API}/drives?${params.toString()}`, { signal });
    const data = await response.json();
    return { items: data.drives || [], nextPageToken: data.nextPageToken };
  }, { signal });
  return collected.items.map((drive) => ({
    id: drive.id,
    name: drive.name || '이름 없는 공유 드라이브',
    driveId: drive.id,
    capabilities: drive.capabilities || {},
    isSharedDrive: true
  }));
}

async function collectSharedDriveFolders(sharedDrives, signal) {
  const drives = (Array.isArray(sharedDrives) ? sharedDrives : [])
    .filter((drive) => drive?.id && drive.capabilities?.canListChildren !== false);
  if (!drives.length) return [];
  const results = new Array(drives.length);
  let cursor = 0;
  let collectedCount = 0;
  const worker = async () => {
    while (cursor < drives.length) {
      const index = cursor++;
      const drive = drives[index];
      const collected = await collectAllPages(async (pageToken) => {
        const params = new URLSearchParams({
          pageSize: String(DRIVE_PAGE_SIZE),
          q: `trashed = false and mimeType = '${FOLDER_MIME}'`,
          spaces: 'drive',
          corpora: 'drive',
          driveId: drive.id,
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
          fields: 'nextPageToken,incompleteSearch,files(id,name,parents,driveId,resourceKey,capabilities(canAddChildren))'
        });
        if (pageToken) params.set('pageToken', pageToken);
        const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal });
        return response.json();
      }, { signal });
      if (collected.incompleteSearch) {
        throw new Error(`공유 드라이브 "${drive.name}"의 폴더 검색 결과가 완전하지 않습니다.`);
      }
      results[index] = collected.items;
      collectedCount += collected.items.length;
      if (el.moveFolderList) {
        el.moveFolderList.textContent = `공유 드라이브 폴더 확인 중… ${collectedCount.toLocaleString('ko-KR')}개`;
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, drives.length) }, () => worker()));
  return results.flat();
}

/* 실제 루트 폴더 ID 해소 — Drive API v3에서 'root' 별칭을 실제 ID로 변환한다.
   about?fields=rootFolderId는 v3에 존재하지 않으므로
   GET /files/root?fields=id 엔드포인트를 사용한다. */
async function resolveRootFolderId() {
  if (state.demo) {
    state.rootFolderId = state.rootFolderId || 'root';
    return state.rootFolderId;
  }
  if (state.rootFolderId && state.rootFolderId !== 'root') return state.rootFolderId;
  try {
    const response = await driveFetch(`${DRIVE_API}/files/root?fields=id`);
    const data = await response.json();
    if (data.id) {
      state.rootFolderId = data.id;
      return data.id;
    }
  } catch (err) {
    if (err?.name === 'AbortError' || err?.status === 401) throw err;
    console.warn('resolveRootFolderId failed, falling back to root alias:', err);
  }
  if (!state.rootFolderId) state.rootFolderId = 'root';
  return state.rootFolderId;
}

function renderMoveFolderList(filterRaw) {
  if (!el.moveFolderList) return;
  el.moveFolderList.replaceChildren();
  if (!state.folderIndex) {
    const loading = document.createElement('div');
    loading.className = 'move-folder-empty';
    loading.textContent = '폴더 목록을 불러오는 중…';
    el.moveFolderList.appendChild(loading);
    return;
  }
  const filter = String(filterRaw || '').trim().toLocaleLowerCase('ko');
  const files = actionFilesSnapshot();
  const filtered = filter
    ? state.moveFolderRows.filter((row) => String(row.name || '').toLocaleLowerCase('ko').includes(filter))
    : state.moveFolderRows;
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'move-folder-empty';
    empty.textContent = '일치하는 폴더가 없습니다.';
    el.moveFolderList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.slice(0, state.moveResultLimit).forEach((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-folder-row';
    button.setAttribute('role', 'option');
    const blockReason = getBulkMoveBlockReason(files, row);
    const isCurrent = blockReason === '현재 위치';
    if (isCurrent) button.classList.add('current');
    if (blockReason) button.disabled = true;
    if (state.moveTargetFolderId === row.id) button.classList.add('selected');
    button.style.setProperty('--depth', String(row.depth));

    const name = document.createElement('span');
    name.className = 'move-folder-name';
    name.textContent = row.name;
    button.appendChild(name);
    if (blockReason) {
      const badge = document.createElement('span');
      badge.className = 'move-folder-current';
      badge.textContent = blockReason;
      button.appendChild(badge);
    }
    button.addEventListener('click', () => {
      state.moveTargetFolderId = row.id;
      el.moveFolderList.querySelectorAll('.move-folder-row').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      if (el.moveConfirmButton) el.moveConfirmButton.disabled = false;
    });
    fragment.appendChild(button);
  });
  el.moveFolderList.appendChild(fragment);
  if (filtered.length > state.moveResultLimit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'move-folder-more';
    more.textContent = `폴더 ${Math.min(MOVE_RESULT_BATCH, filtered.length - state.moveResultLimit).toLocaleString('ko-KR')}개 더 보기`;
    more.addEventListener('click', () => {
      state.moveResultLimit += MOVE_RESULT_BATCH;
      renderMoveFolderList(filterRaw);
    });
    el.moveFolderList.appendChild(more);
  }
}

function normalizedDriveId(item) {
  return item?.driveId || 'my-drive';
}

function getMoveBlockReason(file, targetRow, currentParents = []) {
  if (!targetRow?.id) return '선택 불가';
  if (currentParents.includes(targetRow.id)) return '현재 위치';
  if (targetRow.capabilities?.canAddChildren === false) return '읽기 전용';
  if (!file) return null;
  const crossesDrive = normalizedDriveId(file) !== normalizedDriveId(targetRow);
  if (crossesDrive && file.driveId && file.capabilities?.canMoveItemOutOfDrive === false) return '드라이브 간 이동 불가';
  if (!crossesDrive && file.capabilities?.canMoveItemWithinDrive === false) return '이동 권한 없음';
  return null;
}

function getBulkMoveBlockReason(files, targetRow) {
  const items = Array.isArray(files) ? files : [];
  let actionableCount = 0;
  for (const file of items) {
    const parents = Array.isArray(file.parents) && file.parents.length
      ? file.parents
      : [state.rootFolderId || 'root'];
    const reason = getMoveBlockReason(file, targetRow, parents);
    if (reason === '현재 위치') continue;
    if (reason) return reason;
    actionableCount++;
  }
  return actionableCount ? null : '현재 위치';
}

async function moveDriveFile(file, targetRow) {
  const target = targetRow.id;
  const currentParents = Array.isArray(file.parents) && file.parents.length
    ? file.parents
    : [state.rootFolderId || 'root'];
  if (currentParents.includes(target)) return { skipped: true };
  const blockReason = getMoveBlockReason(file, targetRow, currentParents);
  if (blockReason) {
    const error = new Error(blockReason);
    error.status = 403;
    throw error;
  }
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    file.parents = [target];
    return { skipped: false };
  }
  const params = new URLSearchParams({
    addParents: target,
    removeParents: currentParents.join(','),
    supportsAllDrives: 'true',
    fields: 'id,parents,driveId,capabilities(canMoveItemOutOfDrive,canMoveItemWithinDrive)'
  });
  const referencedFolders = currentParents
    .map((parentId) => state.moveFolderRows.find((row) => row.id === parentId))
    .filter(Boolean);
  const resourceKeys = buildResourceKeysHeader([file, targetRow, ...referencedFolders]);
  const headers = { 'Content-Type': 'application/json' };
  if (resourceKeys) headers['X-Goog-Drive-Resource-Keys'] = resourceKeys;
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params.toString()}`, {
    method: 'PATCH',
    headers,
    body: '{}'
  });
  const moved = await response.json();
  file.parents = Array.isArray(moved.parents) && moved.parents.length ? moved.parents : [target];
  file.driveId = moved.driveId || targetRow.driveId || null;
  file.capabilities = { ...(file.capabilities || {}), ...(moved.capabilities || {}) };
  return { skipped: false };
}

async function performMoveFile() {
  const files = actionFilesSnapshot();
  const targetRowId = state.moveTargetFolderId;
  if (!files.length || !targetRowId || state.moving || state.bulkAction) return;
  const targetRow = state.moveFolderRows.find((row) => row.id === targetRowId);
  const target = targetRow?.id;
  if (!target) {
    showToast('이동할 폴더를 다시 선택해 주세요.');
    return;
  }
  const blockReason = getBulkMoveBlockReason(files, targetRow);
  if (blockReason) {
    showToast(`이 폴더로 이동할 수 없습니다: ${blockReason}`);
    return;
  }
  state.moving = true;
  state.bulkAction = true;
  updateSelectionUI();
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  setButtonLoading(el.moveConfirmButton, true, files.length > 1 ? `${files.length}개 이동 중…` : '이동 중…');
  try {
    const order = getPlaybackFileList();
    const currentId = state.selected?.id || null;
    const removedIndex = currentId ? order.findIndex((file) => file.id === currentId) : -1;
    const results = await runTaskPool(files, (file) => moveDriveFile(file, targetRow));
    const moved = results.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).map((result) => result.item);
    const skipped = results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const movedIds = new Set(moved.map((file) => file.id));

    if (!state.deepScan) state.files = state.files.filter((file) => !movedIds.has(file.id));
    moved.forEach((file) => shuffledOrderMap.delete(file.id));
    if (state.treeCache) state.treeCache = buildTreeIndexes(state.treeCache.items);
    if (el.moveDialog?.open) el.moveDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();

    settleSelectionAfterBulk(failed.map((result) => result.item));
    if (currentId && movedIds.has(currentId)) playNextAfterRemoval(order, removedIndex, movedIds);

    if (!failed.length) {
      const skippedText = skipped.length ? ` · ${skipped.length.toLocaleString('ko-KR')}개는 이미 해당 위치` : '';
      const demoText = state.demo ? ' (데모 시뮬레이션)' : '';
      showToast(`${moved.length.toLocaleString('ko-KR')}개 파일을 이동했습니다${skippedText}.${demoText}`);
    } else {
      if (failed.some((result) => result.reason?.status === 401)) clearToken(false);
      showToast(`${moved.length.toLocaleString('ko-KR')}개 이동, ${failed.length.toLocaleString('ko-KR')}개 실패: ${humanizeDriveError(failed[0]?.reason)}`);
      if (failed.some((result) => result.reason?.status === 403)) openPermissionGuide();
    }
  } catch (error) {
    console.error('Bulk move failed', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearToken(false);
      showToast('Google 인증이 만료됐습니다. 다시 연결해 주세요.');
    } else if (error?.status === 403) {
      openPermissionGuide();
    } else {
      showToast(`이동하지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    state.moving = false;
    state.bulkAction = false;
    if (el.moveConfirmButton) el.moveConfirmButton.disabled = !state.moveTargetFolderId;
    setButtonLoading(el.moveConfirmButton, false);
    updateSelectionUI();
  }
}

function openPermissionGuide() {
  if (el.permissionDialog && !el.permissionDialog.open) el.permissionDialog.showModal();
}

function scheduleVideoFramePresentation(video = el.videoPlayer, session = state.mediaSession) {
  if (!video || video.hidden || !isCurrentMediaEvent(video)) return;
  const presentationKey = String(session);
  if (video.dataset.presentationSession === presentationKey) return;
  video.dataset.presentationSession = presentationKey;
  let presented = false;
  const reveal = () => {
    if (presented) return;
    presented = true;
    if (
      state.mediaSession !== session || !isCurrentMediaEvent(video)
      || video.dataset.presentationSession !== presentationKey
    ) return;
    delete video.dataset.presentationSession;
    video.classList.add('is-ready');
    video.classList.remove('has-poster');
    video.removeAttribute('poster');
    tryCaptureAmbientFrame();
    el.mediaLoading.hidden = true;
    el.mediaError.hidden = true;
    updateQualityDisplay();
    hideSwipeNeighbor({ immediate: false });
  };

  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback(() => reveal());
  } else {
    requestAnimationFrame(() => requestAnimationFrame(reveal));
  }
}

function onMediaReady() {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  if (el.videoPlayer && !el.videoPlayer.hidden) {
    scheduleVideoFramePresentation(el.videoPlayer, state.mediaSession);
  }
  if (el.imageViewer && !el.imageViewer.hidden) {
    el.imageViewer.classList.add('is-ready');
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
  if (!verified) return '원본 확인 중';
  if (mode === PLAYBACK_MODE.SEQUENTIAL) return 'Drive 원본 파일 · 연속 전송';
  if (mode === PLAYBACK_MODE.OPFS) return 'Drive 원본 파일 · 임시 디스크';
  if (mode === PLAYBACK_MODE.MEMORY) return 'Drive 원본 파일 · 메모리';
  return 'Drive 원본 파일 · Range 무변환 전송';
}

function updateQualityDisplay() {
  const file = state.selected;
  if (!file) return;

  const attempt = state.mediaAttempt;
  const playbackMode = state.mediaPlaybackMode;
  const qualityLabel = getPlaybackQualityLabel(playbackMode, state.mediaTransportVerified);
  const isVideo = file.mimeType?.startsWith('video/');
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

  if (el.mediaFileSizeType) {
    const sizeStr = formatBytes(file.size);
    const mimeStr = friendlyMime(file.mimeType);
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
  } else if (playbackMode === PLAYBACK_MODE.OPFS || playbackMode === PLAYBACK_MODE.MEMORY) {
    setStreamMode('buffer', qualityLabel);
    if (el.qualityBadge) {
      el.qualityBadge.hidden = !state.mediaTransportVerified;
      el.qualityBadge.dataset.quality = state.mediaTransportVerified ? 'buffer' : 'pending';
      el.qualityBadge.textContent = `· ${qualityLabel}`;
    }
    if (el.mediaResolution) {
      if (effectiveW && effectiveH) {
        el.mediaResolution.textContent = `${effectiveW} × ${effectiveH}${effectiveCat ? ` (${effectiveCat})` : ''}`;
      } else {
        el.mediaResolution.textContent = '원본 해상도 분석 중…';
      }
    }
  } else {
    setStreamMode(
      playbackMode === PLAYBACK_MODE.SEQUENTIAL ? 'sequential' : 'range',
      qualityLabel
    );
    if (el.qualityBadge) {
      el.qualityBadge.hidden = !state.mediaTransportVerified;
      el.qualityBadge.dataset.quality = state.mediaTransportVerified ? 'original' : 'pending';
      el.qualityBadge.textContent = `· ${qualityLabel}`;
    }
    if (el.mediaResolution) {
      if (effectiveW && effectiveH) {
        el.mediaResolution.textContent = `${effectiveW} × ${effectiveH}${effectiveCat ? ` (${effectiveCat})` : ''}`;
      } else {
        el.mediaResolution.textContent = '원본 해상도 분석 중…';
      }
    }
  }

}

function showMediaLoading(message) {
  el.mediaLoadingText.textContent = message;
  el.mediaLoading.hidden = false;
  el.mediaError.hidden = true;
}

function showMediaError(message, { title = '이 파일을 재생할 수 없습니다', showDrive = false, showRetry = true } = {}) {
  clearTimeout(controlsHideTimer);
  el.playerModal?.classList.remove('controls-idle', 'immersive');
  el.playerModal?.classList.add('media-recovery-mode');
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = false;
  if (el.mediaErrorTitle) el.mediaErrorTitle.textContent = title;
  el.mediaErrorMessage.textContent = message;
  el.openDriveButton.hidden = !showDrive;
  el.retryMediaButton.hidden = !showRetry;
  el.bufferOriginalButton.hidden = true;
  el.bufferOriginalButton.textContent = '원본 전체 임시 저장';
  el.compatPlayerButton.hidden = true;
  hideSwipeNeighbor({ immediate: false });
  requestAnimationFrame(() => el.mediaErrorTitle?.focus({ preventScroll: true }));
}

function retryMedia() {
  if (!state.selected) return;
  if (state.mediaAttempt === 'drive-preview-error') {
    showDrivePreview(state.selected, state.drivePreviewReason || '원본 재생 경로를 사용할 수 없어');
    return;
  }
  if (!hasUsableToken() && !state.demo) {
    state.retryAfterAuth = true;
    state.authRetryContext = { fileId: state.selected.id, mediaSession: state.mediaSession };
    requestGoogleToken({ background: false, force: true });
    return;
  }
  openMediaSource(state.selected);
}

function closePlayer() {
  if (el.playerSheet.hidden) return;
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
  resetMediaElements();
  setPlayerMediaPriorityActive(false);
  if (el.playerMoreMenu) el.playerMoreMenu.open = false;
  isPlayerMoreOpen = false;
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
  requestAnimationFrame(() => {
    if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  });
}

function clearDirectMediaSources() {
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
  if (state.mediaBlobUrl) {
    URL.revokeObjectURL(state.mediaBlobUrl);
    state.mediaBlobUrl = null;
  }
  cleanupOriginalTempStorage();
}

function resetMediaElements() {
  state.mediaSession += 1;
  clearTimeout(mediaRecoveryTimer);
  mediaRecoveryTimer = null;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  if (state.frameCallbackId != null && el.videoPlayer?.cancelVideoFrameCallback) {
    el.videoPlayer.cancelVideoFrameCallback(state.frameCallbackId);
  }
  state.frameCallbackId = null;
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
  if (el.seekBarThumb) el.seekBarThumb.style.setProperty('--seek-x', '0px');
  el.mediaError.hidden = true;
  el.playerModal?.classList.remove('media-recovery-mode');
  el.openDriveButton.hidden = false;
  el.retryMediaButton.hidden = false;
  el.bufferOriginalButton.hidden = true;
  el.compatPlayerButton.hidden = true;
  if (el.mediaErrorTitle) el.mediaErrorTitle.textContent = '이 파일을 재생할 수 없습니다';
  el.mediaLoading.hidden = false;
  el.mediaLoadingText.textContent = '원본 스트림 준비 중';
  state.mediaAttempt = 'idle';
  state.mediaPlaybackMode = '';
  state.mediaTransportVerified = false;
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
  state.retryAfterAuth = false;
  state.authRetryContext = null;
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || matchMedia('(max-width: 600px)').matches;
}

function openSettings(scrollToHelp) {
  el.settingsClientId.value = state.clientIdOverride;
  clearSettingsClientIdError();
  if (!el.settingsDialog.open) el.settingsDialog.showModal();
  if (scrollToHelp) requestAnimationFrame(() => el.setupHelpSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function saveSettings() {
  const enteredValue = el.settingsClientId.value.trim();
  if (enteredValue && !validateClientId(enteredValue)) {
    el.settingsClientId.setAttribute('aria-invalid', 'true');
    el.settingsClientIdHint.textContent = '…apps.googleusercontent.com 형식의 웹 OAuth 클라이언트 ID를 입력하세요.';
    el.settingsClientIdHint.classList.add('error');
    el.settingsClientId.focus({ preventScroll: true });
    showToast('올바른 웹 OAuth 클라이언트 ID가 아닙니다.');
    return;
  }
  const override = normalizeClientIdOverride(enteredValue);
  const nextClientId = override || DEFAULT_OAUTH_CLIENT_ID;
  const changed = nextClientId !== state.clientId;
  state.clientIdOverride = override;
  state.clientId = nextClientId;
  el.settingsClientId.value = override;
  if (override) localStorage.setItem(CLIENT_ID_KEY, override);
  else localStorage.removeItem(CLIENT_ID_KEY);
  if (changed) {
    state.tokenClient = null;
    clearToken(false);
    invalidateDriveSessionData();
  }
  clearClientIdError();
  clearSettingsClientIdError();
  showToast(override
    ? '이 기기에서 자체 OAuth 클라이언트 ID를 사용합니다.'
    : '기본 OAuth 연결 설정을 사용합니다.');
}

function disconnect() {
  const token = state.token;
  clearToken(true);
  invalidateDriveSessionData();
  state.selected = null;
  closePlayer();
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  if (el.settingsDialog.open) el.settingsDialog.close();
  showSetup();
  showToast('Google Drive 연결을 해제했습니다.');
}

function clearToken(notifyWorker) {
  state.authGeneration += 1;
  pendingTokenRequest?.finish(false);
  pendingTokenRequest = null;
  // A settled request from the old generation must not single-flight a new
  // authorization attempt after credentials are explicitly cleared.
  tokenRequestPromise = null;
  tokenRequestGeneration = -1;
  tokenRequestBackground = true;
  state.token = null;
  state.expiresAt = 0;
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (_) {}
  if (notifyWorker) {
    const message = { type: 'CLEAR_TOKEN' };
    navigator.serviceWorker.controller?.postMessage(message);
    const registration = state.serviceWorkerRegistration;
    [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
  }
}

function invalidateDriveSessionData() {
  state.folderIndexAbortController?.abort();
  state.treeAbort?.abort();
  resetListingSession();
  state.folderIndex = null;
  state.folderIndexPromise = null;
  state.moveFolderRows = [];
  state.rootFolderId = null;
  state.treeCache = null;
  state.treeCachePromise = null;
  clearTimeout(state.accountStateSyncTimer);
  state.accountStateSyncTimer = null;
  state.accountId = null;
  state.accountMediaState = createEmptyAccountMediaState();
  state.accountStateFileId = null;
  state.accountStateLoaded = false;
  state.accountStateLoadingPromise = null;
  state.accountStateSyncPromise = null;
  state.accountStateLastSyncAt = 0;
  state.favoriteFiles = [];
}

async function copyOrigin() {
  try {
    await navigator.clipboard.writeText(location.origin);
    showToast('현재 원본 주소를 복사했습니다.');
  } catch (_) {
    showToast('복사하지 못했습니다. 주소를 직접 선택해 복사하세요.');
  }
}

function showSetup() {
  el.setupView.hidden = false;
  el.libraryView.hidden = true;
  updateConnectionBadge();
}

function showLibrary() {
  el.setupView.hidden = true;
  el.libraryView.hidden = false;
}

function setConnectBusy(busy) {
  el.connectButton.disabled = busy;
  const label = el.connectButton.querySelector('span');
  if (label) label.textContent = busy ? 'Google 연결 대기 중…' : 'Google Drive에 연결';
}

function updateConnectionBadge(forcedState) {
  const badgeState = forcedState || (!navigator.onLine ? 'offline' : hasUsableToken() || state.demo ? 'online' : 'offline');
  el.connectionBadge.dataset.state = badgeState;
  const label = el.connectionBadge.querySelector('.badge-text') || el.connectionBadge.querySelector('span:last-child');
  if (label) {
    if (badgeState === 'busy') label.textContent = '연결 중…';
    else if (!navigator.onLine) label.textContent = '오프라인';
    else if (badgeState === 'online') label.textContent = state.demo ? '데모 모드' : 'Drive 연결됨';
    else label.textContent = '연결 안 됨';
  }
}

function hasUsableToken() {
  return Boolean(state.token && Date.now() < state.expiresAt - TOKEN_SKEW_MS);
}

function validateClientId(value) {
  return /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

function setClientIdError(message) {
  el.clientIdHint.textContent = message;
  el.clientIdHint.classList.add('error');
}

function getStaticGifThumbnailObserver() {
  if (typeof IntersectionObserver !== 'function') return null;
  if (gifThumbnailObserver) return gifThumbnailObserver;
  gifThumbnailObserver = new IntersectionObserver((observations) => {
    observations.forEach((observation) => {
      const entry = gifThumbnailEntries.get(observation.target);
      if (!entry || entry.disposed) return;
      entry.nearby = observation.isIntersecting;
      if (entry.nearby) queueStaticGifThumbnailEntry(entry);
      else releaseStaticGifThumbnail(entry);
    });
  }, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0
  });
  return gifThumbnailObserver;
}

function registerStaticGifThumbnail(file, canvas, visualContainer, placeholder, eager = false) {
  if (!file?.thumbnailLink || !canvas) return;
  const entry = {
    file,
    canvas,
    visualContainer,
    placeholder,
    generation: thumbnailGeneration,
    nearby: false,
    queued: false,
    loading: false,
    loaded: false,
    disposed: false
  };
  gifThumbnailEntries.set(canvas, entry);
  const observer = getStaticGifThumbnailObserver();
  if (observer) {
    observer.observe(canvas);
  } else if (eager) {
    entry.nearby = true;
    queueStaticGifThumbnailEntry(entry);
  }
}

function queueStaticGifThumbnail(file, canvas, visualContainer, placeholder) {
  if (!file?.thumbnailLink || !canvas) return;
  let entry = gifThumbnailEntries.get(canvas);
  if (!entry) {
    entry = {
      file,
      canvas,
      visualContainer,
      placeholder,
      generation: thumbnailGeneration,
      nearby: true,
      queued: false,
      loading: false,
      loaded: false,
      disposed: false
    };
    gifThumbnailEntries.set(canvas, entry);
  } else {
    entry.nearby = true;
  }
  queueStaticGifThumbnailEntry(entry);
}

function queueStaticGifThumbnailEntry(entry) {
  if (
    typeof Image !== 'function' || !entry || entry.disposed || entry.loaded
    || entry.loading || entry.queued || !entry.nearby
    || entry.generation !== thumbnailGeneration
    || entry.canvas?.isConnected === false || !entry.file?.thumbnailLink
  ) return;
  entry.queued = true;
  gifThumbnailQueue.push(entry);
  setTimeout(processGifThumbnailQueue, 0);
}

function releaseStaticGifThumbnail(entry, { dispose = false } = {}) {
  if (!entry || entry.disposed) return;
  entry.nearby = false;
  entry.queued = false;
  if (entry.loading) {
    [...activeGifThumbnailJobs]
      .filter((job) => job.entry === entry)
      .forEach((job) => job.cancel(false));
  }
  if (entry.loaded || dispose) {
    entry.canvas.width = 1;
    entry.canvas.height = 1;
    entry.canvas.classList?.remove?.('loaded');
    entry.visualContainer?.classList?.remove?.('has-thumbnail');
    if (entry.placeholder) entry.placeholder.hidden = false;
    entry.loaded = false;
  }
  if (dispose) {
    entry.disposed = true;
    gifThumbnailObserver?.unobserve(entry.canvas);
  }
}

function pruneStaticGifThumbnailEntries() {
  gifThumbnailEntries.forEach((entry, canvas) => {
    if (canvas?.isConnected !== false) return;
    releaseStaticGifThumbnail(entry, { dispose: true });
    gifThumbnailEntries.delete(canvas);
  });
}

function processGifThumbnailQueue() {
  if (playerMediaPriorityActive) return;
  while (activeGifThumbnailLoads < MAX_CONCURRENT_EXTRACTIONS && gifThumbnailQueue.length) {
    const entry = gifThumbnailQueue.shift();
    entry.queued = false;
    if (
      entry.disposed || !entry.nearby || entry.loaded || entry.loading
      || entry.generation !== thumbnailGeneration
      || entry.canvas?.isConnected === false || !entry.file?.thumbnailLink
    ) continue;

    const image = new Image();
    let settled = false;
    let job = null;
    entry.loading = true;
    activeGifThumbnailLoads += 1;

    const finish = (loaded, defer = false) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute?.('src');
      entry.loading = false;
      activeGifThumbnailJobs.delete(job);
      activeGifThumbnailLoads = Math.max(0, activeGifThumbnailLoads - 1);
      if (
        defer && !entry.disposed && entry.nearby
        && entry.generation === thumbnailGeneration
        && entry.canvas?.isConnected !== false
      ) {
        entry.queued = true;
        gifThumbnailQueue.unshift(entry);
      } else if (
        loaded && !entry.disposed && entry.nearby
        && entry.generation === thumbnailGeneration
        && entry.canvas?.isConnected !== false
      ) {
        entry.loaded = true;
        entry.canvas.classList.add('loaded');
        entry.visualContainer?.classList.add('has-thumbnail');
        if (entry.placeholder) entry.placeholder.hidden = true;
      }
      setTimeout(processGifThumbnailQueue, 0);
    };

    job = { entry, cancel: (defer = false) => finish(false, defer) };
    activeGifThumbnailJobs.add(job);
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      try {
        if (!entry.nearby || entry.disposed || entry.canvas?.isConnected === false) {
          finish(false);
          return;
        }
        const sourceWidth = Number(image.naturalWidth) || 0;
        const sourceHeight = Number(image.naturalHeight) || 0;
        const context = entry.canvas.getContext?.('2d', { alpha: false });
        if (!context || !sourceWidth || !sourceHeight) {
          finish(false);
          return;
        }
        entry.canvas.width = GIF_THUMBNAIL_SIZE;
        entry.canvas.height = GIF_THUMBNAIL_SIZE;
        const cropSize = Math.min(sourceWidth, sourceHeight);
        const sourceX = Math.max(0, (sourceWidth - cropSize) / 2);
        const sourceY = Math.max(0, (sourceHeight - cropSize) / 2);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          GIF_THUMBNAIL_SIZE,
          GIF_THUMBNAIL_SIZE
        );
        finish(true);
      } catch (error) {
        console.warn('GIF static thumbnail capture failed:', error);
        entry.canvas.width = 1;
        entry.canvas.height = 1;
        finish(false);
      }
    };
    image.onerror = () => finish(false);
    image.src = entry.file.thumbnailLink;
  }
}

function clearClientIdError() {
  el.clientIdHint.textContent = 'Google 로그인 창에서 계정과 Drive 권한을 확인합니다.';
  el.clientIdHint.classList.remove('error');
}

function clearSettingsClientIdError() {
  el.settingsClientId.removeAttribute('aria-invalid');
  el.settingsClientIdHint.textContent = '비워 두면 앱에 포함된 기본 OAuth 연결 설정을 사용합니다.';
  el.settingsClientIdHint.classList.remove('error');
}

function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

function humanizeDriveError(error) {
  if (error.status === 401) return '인증이 만료됐습니다.';
  if (error.status === 403) return 'Drive API 사용 설정, OAuth 범위, 또는 계정 권한을 확인하세요.';
  return error.message || '알 수 없는 오류';
}

function dedupeFiles(files) {
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatDuration(secondsValue) {
  const total = Math.max(0, Math.round(Number(secondsValue) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolutionText(file) {
  const metadata = file.videoMediaMetadata || file.imageMediaMetadata;
  const width = Number(metadata?.width);
  const height = Number(metadata?.height);
  return width && height ? `${width}×${height}` : '';
}

function friendlyMime(mime) {
  if (!mime) return '알 수 없음';
  const known = {
    'video/mp4': 'MP4',
    'video/quicktime': 'MOV',
    'video/x-matroska': 'MKV',
    'video/webm': 'WebM',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/heic': 'HEIC',
    'image/heif': 'HEIF',
    'image/webp': 'WebP',
    'image/gif': 'GIF'
  };
  return known[mime] || mime.split('/').pop().toUpperCase();
}

function startDemoMode() {
  const demoItems = [
    { id: 'demo-folder-1', name: '여행 원본 클립', mimeType: FOLDER_MIME, parents: ['root'] },
    { id: 'demo-folder-2', name: '가족 사진 아카이브', mimeType: FOLDER_MIME, parents: ['root'] },
    { id: 'demo-folder-1-1', name: '2025 도쿄 원본', mimeType: FOLDER_MIME, parents: ['demo-folder-1'] },
    { id: 'demo-video-1', name: '서울 야간 산책 — 4K.mov', mimeType: 'video/quicktime', size: '4873258598', modifiedTime: '2026-08-15T08:30:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(0), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '437000' } },
    { id: 'demo-image-1', name: '한강 원본 사진.heic', mimeType: 'image/heic', size: '12845032', modifiedTime: '2026-08-14T12:10:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(1), imageMediaMetadata: { width: 5712, height: 4284 } },
    { id: 'demo-video-2', name: '강의 녹화 03.mp4', mimeType: 'video/mp4', size: '2137483648', modifiedTime: '2026-08-13T05:40:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(2), videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '3842000' } },
    { id: 'demo-video-3', name: '여행 클립 — HEVC.mp4', mimeType: 'video/mp4', size: '876523100', modifiedTime: '2026-08-08T16:00:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(3), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '187000' } },
    { id: 'demo-video-4', name: '도쿄 골목 — 세로 쇼츠.mp4', mimeType: 'video/mp4', size: '412556320', modifiedTime: '2026-08-07T09:00:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1-1'], thumbnailLink: demoImageDataUrl(4), videoMediaMetadata: { width: 2160, height: 3840, durationMillis: '221000' } },
    { id: 'demo-image-2', name: '문서 스캔 원본.png', mimeType: 'image/png', size: '24576000', modifiedTime: '2026-08-11T03:20:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-2'], thumbnailLink: demoImageDataUrl(4), imageMediaMetadata: { width: 4032, height: 3024 } }
  ];
  state.treeCache = buildTreeIndexes(demoItems);
  computeAndRenderSubtree();
  showLibrary();
  el.libraryStatus.textContent = '데모 모드 — 실제 Google Drive 요청은 실행하지 않습니다.';
  updateConnectionBadge();
}

function demoImageDataUrl(seed = 0) {
  const palettes = [
    ['#0d1626', '#2376df', '#1c6a69', '#59a48b'],
    ['#21172d', '#bf8eda', '#8a4f73', '#df84a8'],
    ['#1d2024', '#de9255', '#6c7042', '#d0b768'],
    ['#102329', '#4fb9c9', '#246b78', '#72bc8f'],
    ['#231b18', '#e97366', '#8a503d', '#de9255']
  ];
  const [background, sun, back, front] = palettes[seed % palettes.length];
  const sunX = 1080 + (seed % 3) * 110;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${background}"/><circle cx="${sunX}" cy="260" r="180" fill="${sun}" opacity=".78"/><path d="M0 740L430 410l280 230 230-180 660 540H0z" fill="${back}"/><path d="M0 810l500-300 350 270 250-160 500 380H0z" fill="${front}" opacity=".82"/><rect x="80" y="80" width="360" height="8" rx="4" fill="#fff" opacity=".7"/><rect x="80" y="110" width="220" height="5" rx="2" fill="#fff" opacity=".3"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
