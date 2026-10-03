'use strict';

const APP_VERSION = '1.22.0';
const DRIVE_MUTATIONS_ENABLED = globalThis.__DRIVE_ORIGINAL_RUNTIME__?.driveMutationsEnabled === true;
const ACCOUNT_STATE_WRITES_ENABLED = DRIVE_MUTATIONS_ENABLED
  || globalThis.__DRIVE_ORIGINAL_RUNTIME__?.accountStateWritesEnabled === true;
const ACCOUNT_STATE_WRITE = Symbol('account-state-write');
const ACCOUNT_STATE_READ = Symbol('account-state-read');
const ACCOUNT_STATE_READ_RESPONSE = Symbol('account-state-read-response');
const DISPOSABLE_DRIVE_MUTATION = Symbol('disposable-drive-mutation');
const AUTH_PROTOCOL = 'drive-original-auth-v1';
const Q1_RETIRE_PROTOCOL = 'drive-original-q1-retirement-v1';
const AUTH_CREDENTIAL_PATH = '/api/session/credential';
const AUTH_LOGOUT_PATH = '/api/session/logout';
const AUTH_DISCONNECT_PATH = '/api/account/disconnect';
const AUTH_START_PATH = '/auth/google/start';
const AUTH_CSRF_HEADER = 'X-Drive-Original-CSRF';
const AUTH_CREDENTIAL_TIMEOUT_MS = 55_000;
const AUTH_MUTATION_TIMEOUT_MS = 25_000;
const AUTH_STANDALONE_RECOVERY_DELAYS_MS = Object.freeze([0, 800, 2_000]);
const AUTH_STANDALONE_DEADLINE_MS = 600_000;
const LEGACY_TOKEN_STORAGE_KEY = 'drive-original.oauth-token';
const LEGACY_CLIENT_ID_STORAGE_KEY = 'drive-original.oauth-client-id';
const AUTH_ERROR_CODES = new Set([
  'account_mismatch', 'stale_revision', 'reconnect_required', 'auth_unavailable',
  'unauthorized', 'forbidden', 'bad_request', 'client_update_required'
]);
const AUTH_CALLBACK_ERROR_MESSAGES = Object.freeze({
  transaction_invalid: 'Google 로그인 요청이 만료되었거나 확인되지 않았습니다. 다시 연결해 주세요.',
  auth_unavailable: 'Google 인증을 완료하지 못했습니다. 잠시 후 다시 연결해 주세요.'
});
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
const FILE_NAME_COLLATOR = new Intl.Collator('ko', { numeric: true });
const DRIVE_PAGE_SIZE = 1000;
const RENDER_WINDOW_MAX = 240;
const RENDER_WINDOW_STEP_RATIO = 0.5;
const MOVE_RESULT_BATCH = 200;
const FOLDER_RENDER_MAX = 200;
const BULK_ACTION_CONCURRENCY = 4;
const DEFAULT_FRAME_DURATION = 1 / 30;
const MEDIA_ERROR_CLASSIFY_DELAY_MS = 180;
const MEDIA_FRAME_NO_PROGRESS_TIMEOUT_MS = 15_000;
const MEDIA_SEEK_COMPLETION_TIMEOUT_MS = 15_000;
const DRIVE_PREVIEW_SLOW_MS = 8_000;
const DRIVE_PREVIEW_TIMEOUT_MS = 30_000;
const MAX_ORIGINAL_RETRY_AFTER_MS = 2_147_483_647;
const GIF_THUMBNAIL_SIZE = 320;
const ACCOUNT_STATE_FILE_NAME = 'drive-original-account-state.json';
const ACCOUNT_STATE_WRITER_PREFIX = 'drive-original-account-state-v2-';
const ACCOUNT_WRITER_STORAGE_KEY = 'drive-original.account-writer';
const ACCOUNT_STATE_CACHE_PREFIX = 'drive-original.account-state.';
const ACCOUNT_STATE_SCHEMA_VERSION = 1;
const ACCOUNT_STATE_SYNC_DELAY_MS = 650;
const ACCOUNT_STATE_REFRESH_INTERVAL_MS = 15_000;
const ACCOUNT_STATE_READ_TIMEOUT_MS = 30_000;
const FAVORITE_FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,driveId,capabilities(canDownload,canDelete,canMoveItemOutOfDrive,canMoveItemWithinDrive),parents,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation)';
const PLAYBACK_MODE = Object.freeze({
  RANGE: 'original-range',
  SEQUENTIAL: 'original-sequential',
  OPFS: 'original-opfs',
  MEMORY: 'original-memory',
  REPACKAGED: 'original-repackaged',
  AUDIO_COMPATIBILITY: 'original-video-audio-compatible',
  VIDEO_COMPATIBILITY: 'video-compatible-lossy',
  COMPATIBILITY: 'compatibility-preview'
});

function classifyMediaProxyFailure(data = {}) {
  const status = Number(data.status) || 0;
  const reasons = Array.isArray(data.reasons) ? data.reasons : [];
  const driveReason = String(data.driveReason || reasons[0] || '');
  const category = String(data.category || '');
  if (category === 'source-pin' || data.name === 'RevisionPinError') return 'source-pin';
  if (category === 'auth' || status === 401) return 'auth';
  if (category === 'timeout') return 'timeout';
  if (category === 'rate-limit' || status === 429 || /rateLimitExceeded/i.test(driveReason)) return 'rate-limit';
  if (category === 'not-found' || status === 404) return 'not-found';
  if (status === 416 || category === 'range-not-satisfiable') return 'range-416';
  if (category === 'range-invalid' || (status === 206 && data.rangeSatisfied === false)) return 'range-invalid';
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
    || /\bOPFS\b|quota|temporary (?:storage|buffer)|memory buffer|buffer limit/i
      .test(String(error?.message || ''));
}

function isCurrentOriginalBufferOwner(file, session, sourceGeneration) {
  return Boolean(file)
    && state.selected?.id === file.id
    && state.mediaSession === session
    && mediaSourceGeneration === sourceGeneration;
}

function createOriginalBufferOwnerError() {
  return new DOMException('Media source changed', 'AbortError');
}

function decideMediaRecovery({
  cause,
  isVideo = true,
  downloadAllowed = true,
  rangeRetryCount = 0,
  rangeRebuildCount = 0,
  permissionRetryCount = 0
} = {}) {
  if (cause === 'source-pin') return 'fail-source-pin';
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

function resolveMediaDoubleTapAction(clientX, stageLeft, stageWidth, isVideo, zone = 'center') {
  const width = Math.max(1, Number(stageWidth) || 1);
  const normalizedX = (Number(clientX) - (Number(stageLeft) || 0)) / width;
  if (isVideo && zone === 'left' && normalizedX <= 0.18) return 'seek-backward';
  if (isVideo && zone === 'right' && normalizedX >= 0.82) return 'seek-forward';
  return zone === 'center' ? 'favorite' : null;
}

function createEmptyAccountMediaState() {
  return {
    schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
    updatedAt: 0,
    viewed: Object.create(null),
    favorites: Object.create(null)
  };
}

function normalizeStateTimestamp(value) {
  const timestamp = Number(value);
  return Number.isSafeInteger(timestamp) && timestamp > 0 ? timestamp : 0;
}

function normalizeAccountMediaState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const viewed = Object.create(null);
  const favorites = Object.create(null);
  Object.entries(source.viewed && typeof source.viewed === 'object' ? source.viewed : {}).forEach(([id, timestamp]) => {
    const normalized = normalizeStateTimestamp(timestamp);
    if (id && normalized) viewed[id] = normalized;
  });
  Object.entries(source.favorites && typeof source.favorites === 'object' ? source.favorites : {}).forEach(([id, entry]) => {
    if (!id) return;
    const normalized = entry && typeof entry === 'object'
      ? { liked: Boolean(entry.liked), updatedAt: normalizeStateTimestamp(entry.updatedAt) }
      : { liked: Boolean(entry), updatedAt: 0 };
    favorites[id] = normalized;
  });
  return {
    schemaVersion: ACCOUNT_STATE_SCHEMA_VERSION,
    updatedAt: normalizeStateTimestamp(source.updatedAt),
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
    else if (a.updatedAt === b.updatedAt) {
      // Concurrent equal-clock edits converge regardless of merge order.
      // Preserve an unlike tombstone rather than resurrecting a removed like.
      merged.favorites[id] = { liked: a.liked && b.liked, updatedAt: a.updatedAt };
    } else merged.favorites[id] = b.updatedAt > a.updatedAt ? b : a;
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
    if (signal?.aborted) throw new DOMException('Collection aborted', 'AbortError');
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
  const above = [];
  const below = [];
  // The ordinary forward gesture (swipe up) must get the nearest unseen item,
  // not the third candidate after both backward slots have consumed it.
  unique.slice(0, targetDepth * 2).forEach((id, index) => {
    (index % 2 === 0 ? below : above).push(id);
  });
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
  // Reorder only the continuing side. The reverse side must retain the exact
  // previous item while newly available unseen neighbors precede watched ones.
  const watched = viewedIds instanceof Set ? viewedIds : new Set(viewedIds || []);
  const continuation = direction === 'up' ? next.below : next.above;
  continuation.sort((a, b) => Number(watched.has(a)) - Number(watched.has(b)));
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

const state = {
  token: null,
  expiresAt: 0,
  tokenRevision: 0,
  authAccountKey: null,
  authCapabilities: null,
  authStatus: 'anonymous',
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
  previousAccountId: null,
  accountIdentityPending: false,
  accountLocalStorageError: false,
  accountMediaState: createEmptyAccountMediaState(),
  accountStateFileId: null,
  accountStateWriterId: null,
  accountStateReadCache: new Map(),
  accountStateAbortController: null,
  accountStateLoaded: false,
  accountStateLoadingPromise: null,
  accountStateSyncPromise: null,
  accountStateSyncTimer: null,
  accountStateSyncRetryTimer: null,
  accountStateSyncRetryCount: 0,
  accountStateSyncError: null,
  accountStateRevision: 0,
  accountStateLastSyncAt: 0,
  accountStateRefreshTimer: null,
  accountStateRefreshFailures: 0,
  accountStateRefreshNotBefore: 0,
  accountStateRefreshBlocked: false,
  favoriteFiles: [],
  loadingFavorites: false,
  favoriteLoadGeneration: 0,
  favoriteLoadPromise: null,
  favoriteAbortController: null,
  libraryStatusToken: 0,
  moveTargetFolderId: null,
  moving: false,
  filter: 'all',
  query: '',
  sort: 'modifiedTime',
  selected: null,
  selectionMode: false,
  selectionGeneration: 0,
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
  mediaTransportStarted: false,
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
  driveSessionGeneration: 0,
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
const APP_SHELL_REFRESH_PROTOCOL = 'drive-original-shell-refresh-v1';
const APP_SHELL_REFRESH_TIMEOUT_MS = 20000;
let appShellRefreshPending = null;
let appShellRefreshSequence = 0;
let updateCheckGeneration = 0;
let updateCheckManualPending = false;
const UPDATE_CHECK_TIMEOUT_MS = 15000;
let controlsHideTimer = null;
let isSeekingPointer = false;
let activeSeekCleanup = null;
let isSpeedMenuOpen = false;
let isPlayerMoreOpen = false;
let tokenRenewalTimer = null;
let shuffledOrderMap = new Map();
let sortedPopulationCache = null;
let filteredPopulationCache = null;
let credentialRequestPromise = null;
let credentialRequestGeneration = -1;
let credentialRequestAbortController = null;
let credentialRequestOutcome = null;
let sessionCredentialMarker = null;
let standaloneAuthAttempt = null;
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
let mediaFrameWatchdog = null;
let mediaSeekWatchdog = null;
let completedMediaSeekPresentation = null;
let mediaSeekGeneration = 0;
let mediaSeekSettledGeneration = 0;
let mediaSourceGeneration = 0;
let initialMediaRouteGeneration = 0;
let q1Playback = null;
let playerTracksOwner = null;
let playerTracksRetirement = Promise.resolve({settled: true});
let playerTracksRetirementResult = {settled: true};
let playerSubtitleTextTrack = null;
let q3Choice = null;
let q0Playback = null;
let q0ControlWait = null;
// Private, immutable for this selected file lifetime; never persist or log.
let q0PinnedSource = null;
// One verified raster kind for this selected immutable source, never a catalog cache.
let verifiedOriginalImage = null;
let q1Retirement = Promise.resolve({ settled: true });
let q1RetirementResult = { settled: true };
let q1RetirementSequence = 0;
let pendingPlaybackRestore = null;

function retireQ0Playback() {
  const owner = q0Playback;
  q0Playback = null;
  return retireQ1Playback(owner);
}

function beginQ0Playback(file, session) {
  const owner = { controller: new AbortController(), fileId: file.id, session,
    account: state.authAccountKey, accountGeneration: state.driveSessionGeneration,
    swGeneration: mediaSourceGeneration, swController: navigator.serviceWorker?.controller,
    requiresSwReadiness: true, setupDone: Promise.resolve(), cleanupOk: true };
  q0Playback = owner;
  return owner;
}

function isCurrentQ0Playback(owner, fileId, sourceGeneration) {
  return Boolean(owner && owner === q0Playback && !owner.controller.signal.aborted
    && state.selected?.id === fileId && owner.fileId === fileId
    && owner.session === state.mediaSession && owner.swGeneration === sourceGeneration
    && sourceGeneration === mediaSourceGeneration && owner.account === state.authAccountKey
    && owner.accountGeneration === state.driveSessionGeneration);
}

function q0OwnerContext(owner, clientId) {
  return { clientId, fileId: owner.fileId, mediaSession: String(owner.session),
    sourceGeneration: owner.swGeneration, accountKey: owner.account,
    accountGeneration: owner.accountGeneration };
}

const q0CapableControllers = new WeakMap();
function hasQ0CapableController() {
  const worker = navigator.serviceWorker?.controller;
  return Boolean(worker && globalThis.DriveRevisionPin?.PROTOCOL
    && q0CapableControllers.get(worker) === DriveRevisionPin.PROTOCOL);
}

function waitForQ0Control(file, kind, session, message, onReady) {
  const serviceWorker = navigator.serviceWorker;
  if (q0ControlWait?.fileId === file.id && q0ControlWait.session === session
    && q0ControlWait.accountKey === state.authAccountKey
    && q0ControlWait.accountGeneration === state.driveSessionGeneration
    && q0ControlWait.sourceGeneration === mediaSourceGeneration
    && !q0ControlWait.controller.signal.aborted) return true;
  q0ControlWait?.controller.abort();
  const controller = new AbortController();
  const owner = { fileId: file.id, session, accountKey: state.authAccountKey,
    accountGeneration: state.driveSessionGeneration,
    sourceGeneration: mediaSourceGeneration, controller };
  q0ControlWait = owner;
  state.mediaAbortController?.abort(); state.mediaAbortController = controller;
  state.mediaAttempt = 'range-preparing';
  showMediaLoading(message);
  let finished = false, port = null, probedController = null;
  const closePort = () => { if (port) { port.onmessage = null; port.close(); port = null; } };
  const finish = outcome => {
    if (finished) return;
    finished = true;
    closePort();
    clearTimeout(timer);
    serviceWorker.removeEventListener?.('controllerchange', controlled);
    controller.signal.removeEventListener('abort', cancelled);
    const current = q0ControlWait === owner && !controller.signal.aborted
      && state.selected?.id === file.id && state.mediaSession === session
      && state.authAccountKey === owner.accountKey
      && state.driveSessionGeneration === owner.accountGeneration
      && mediaSourceGeneration === owner.sourceGeneration;
    if (q0ControlWait === owner) q0ControlWait = null;
    if (state.mediaAbortController === controller) state.mediaAbortController = null;
    if (!current) return;
    if (outcome === 'ready') {
      if (onReady) onReady();
      else startOriginalRangePlayback(file, kind, session, message);
    }
    else if (outcome === 'timeout') {
      state.mediaAttempt = 'failed';
      showMediaError('원본 재생 연결 준비가 지연되고 있습니다. 앱을 새로 연 뒤 다시 시도하세요.',
        { title: '재생 연결 준비 필요', showRetry: false });
    }
  };
  const controlled = () => {
    closePort();
    if (q0ControlWait !== owner || controller.signal.aborted
      || state.selected?.id !== owner.fileId || state.mediaSession !== owner.session
      || state.authAccountKey !== owner.accountKey
      || state.driveSessionGeneration !== owner.accountGeneration
      || mediaSourceGeneration !== owner.sourceGeneration) return finish('cancelled');
    const worker = serviceWorker.controller, protocol = globalThis.DriveRevisionPin?.PROTOCOL;
    probedController = worker;
    if (hasQ0CapableController()) return finish('ready');
    if (!worker || !protocol || typeof MessageChannel !== 'function') return;
    const channel = new MessageChannel();
    const requestId = `q0-cap-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    port = channel.port1;
    port.onmessage = event => {
      const data = event.data;
      if (finished || controller.signal.aborted || worker !== probedController
        || serviceWorker.controller !== worker || data?.type !== 'Q0_CAPABILITY_RESPONSE'
        || data.protocol !== protocol || data.requestId !== requestId || data.capable !== true) return;
      q0CapableControllers.set(worker, protocol);
      finish('ready');
    };
    try { worker.postMessage({ type: 'Q0_CAPABILITY_REQUEST', protocol, requestId }, [channel.port2]); }
    catch (_) { closePort(); channel.port2.close(); }
  };
  const cancelled = () => finish('cancelled');
  const timer = setTimeout(() => finish('timeout'), 12000);
  controller.signal.addEventListener('abort', cancelled, { once: true });
  serviceWorker.addEventListener?.('controllerchange', controlled);
  controlled();
  return true;
}

function sameQ0Context(a, b) {
  return ['clientId','fileId','mediaSession','sourceGeneration','accountKey','accountGeneration']
    .every(key => a?.[key] === b?.[key]);
}

function handleQ0PinMessage(event, data) {
  const port = event.ports?.[0], owner = q0Playback;
  if (!port) return;
  const protocol = globalThis.DriveRevisionPin?.PROTOCOL;
  const valid = protocol && data.protocol === protocol && /^[A-Za-z0-9_-]{1,80}$/.test(data.requestId || '')
    && typeof data.clientId === 'string' && data.clientId.length > 0 && data.clientId.length <= 512
    && event.source === owner?.swController && navigator.serviceWorker?.controller === owner?.swController
    && isCurrentQ0Playback(owner, data.fileId, data.sourceGeneration);
  const context = valid ? q0OwnerContext(owner, data.clientId) : null;
  if (data.type === 'Q0_OWNER_REQUEST') {
    port.postMessage({ type: 'Q0_OWNER_RESPONSE', protocol, requestId: data.requestId,
      requestCurrent: Boolean(valid), context,
      resourceKey: valid ? state.selected.resourceKey || null : null,
      traceId: valid ? getMediaDiagnosticTraceId(state.mediaSession) : '',
      acknowledgeAbuse: valid && state.mediaAbuseAcknowledged === true });
  } else {
    let error = null;
    const authorized = valid && sameQ0Context(data.context, context);
    try {
      if (!authorized) throw new Error('OWNER');
      if (data.mode === 'bind') {
        const pin = DriveRevisionPin.validatePin(data.pin, context);
        if (q0PinnedSource && !DriveRevisionPin.samePin(q0PinnedSource, pin)) throw new Error('PIN_REPLACEMENT');
        q0PinnedSource ||= Object.freeze({ ...pin, descriptor: Object.freeze({ ...pin.descriptor }) });
        if (!owner.audioProbeStarted && state.selected?.id === owner.fileId && !el.videoPlayer.hidden) {
          owner.audioProbeStarted = true;
          const pinned = q0PinnedSource;
          owner.formatDecision = new Promise(resolve => { owner.resolveFormatDecision = resolve; });
          // Retirement must join the probe, including late source cancellation.
          owner.setupDone = Promise.resolve().then(() => planPinnedOriginalAudio(owner, pinned));
          // The handoff may retire this owner, so it must run outside setupDone.
          void owner.setupDone.then(async mimeType => {
            if (mimeType) return presentPinnedOriginalImage(owner, pinned, mimeType);
          }).catch(() => {}).finally(() => owner.resolveFormatDecision());
        }
      } else if (data.mode !== 'get') throw new Error('PROTOCOL');
    } catch (_) { error = 'PIN_REJECTED'; }
    port.postMessage({ type: 'Q0_PIN_RESPONSE', protocol, requestId: data.requestId, context,
      requestCurrent: Boolean(authorized && !error), pin: authorized && !error ? q0PinnedSource : null, error });
  }
  port.close?.();
}

function retireQ1Playback(owner) {
  if (!owner || owner.retirement) return owner?.retirement;
  owner.controller.abort();
  const immediate = owner.player?.dispose();
  const previous = q1Retirement;
  owner.retirement = (async () => {
    await owner.setupDone;
    await owner.q3ProbeDone;
    const cleanup = await (immediate || owner.player?.dispose());
    const workerSettled = !owner.requiresSwReadiness || await confirmQ1WorkerRetirement(owner);
    const prior = await previous;
    return { settled: prior.settled && owner.cleanupOk !== false && cleanup?.settled !== false && workerSettled };
  })().catch(() => ({ settled: false })).then(result => {
    if (q1Retirement === owner.retirement) q1RetirementResult = result;
    return result;
  });
  q1Retirement = owner.retirement;
  q1RetirementResult = null;
  return owner.retirement;
}

function confirmQ1WorkerRetirement(owner) {
  const serviceWorker = navigator.serviceWorker, controller = owner.swController;
  if (!controller || serviceWorker?.controller !== controller || typeof MessageChannel !== 'function') return Promise.resolve(false);
  const generation = owner.swGeneration;
  if (!Number.isSafeInteger(generation) || generation < 0) return Promise.resolve(false);
  return new Promise(resolve => {
    const channel = new MessageChannel(), requestId = `q1-retire-${++q1RetirementSequence}`;
    let ended = false;
    const finish = settled => {
      if (ended) return;
      ended = true;
      clearTimeout(timer);
      serviceWorker.removeEventListener?.('controllerchange', replaced);
      channel.port1.onmessage = null; channel.port1.onmessageerror = null;
      channel.port1.close(); channel.port2.close();
      resolve(settled === true && serviceWorker.controller === controller);
    };
    const replaced = () => finish(false);
    const timer = setTimeout(() => finish(false), 2000);
    channel.port1.onmessage = ({ data }) => finish(data?.type === 'Q1_RETIRE_RESPONSE'
      && data.protocol === Q1_RETIRE_PROTOCOL && data.requestId === requestId
      && data.retiredThroughGeneration === generation && data.settled === true);
    channel.port1.onmessageerror = replaced;
    serviceWorker.addEventListener?.('controllerchange', replaced);
    try {
      controller.postMessage({ type: 'Q1_RETIRE_REQUEST', protocol: Q1_RETIRE_PROTOCOL,
        requestId, retiredThroughGeneration: generation }, [channel.port2]);
    } catch (_) { finish(false); }
  });
}
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
let mediaDiagnosticTrace = null;
let mediaDiagnosticSequence = 0;
let mediaDiagnosticPlaybackSequence = 0;
const mediaDiagnosticRetiredTraces = new Map();
const mediaDiagnosticDirectRequestOwners = new Map();
const MEDIA_DIAGNOSTIC_RETIRED_TRACE_LIMIT = 8;
const MEDIA_DIAGNOSTIC_PROGRESS_INTERVAL_MS = 250;
const MEDIA_DIAGNOSTIC_WORKER_STAGES = new Set([
  'credential-requested', 'credential-ready', 'credential-missing',
  'request-start', 'headers', 'first-byte', 'body-progress', 'body-complete',
  'first-byte-timeout', 'body-no-progress', 'body-error', 'http-error', 'range-error', 'request-cancelled'
]);

function getMediaDiagnosticSink() {
  return typeof globalThis.__driveOriginalMediaTraceSink === 'function'
    ? globalThis.__driveOriginalMediaTraceSink
    : null;
}

function reportAppFailure(stage, error, level = 'error') {
  // Provider messages, stacks and attached objects can contain private IDs/URLs.
  const status = Number(error?.status);
  const detail = {
    category: error?.name === 'AbortError' ? 'cancelled'
      : error?.name === 'TypeError' ? 'network-or-type'
      : status === 401 ? 'authentication'
      : status === 403 ? 'permission'
      : status === 404 ? 'missing'
      : status === 429 ? 'rate-limit'
      : status >= 500 && status <= 599 ? 'server' : 'failure'
  };
  if (Number.isInteger(status) && status >= 100 && status <= 599) detail.status = status;
  const codes = ['candidate_read_only', 'insufficient_scope', 'account_mismatch',
    'reconnect_required', 'reauthorization_required', 'auth_unavailable', 'stale_revision'];
  if (codes.includes(error?.code)) detail.code = error.code;
  console[level === 'warn' ? 'warn' : 'error'](`[drive-original] ${stage}`, detail);
}

function mediaDiagnosticTimestamp() {
  return Date.now();
}

function sanitizeMediaDiagnosticDetails(details = {}) {
  const allowed = [
    'route', 'reason', 'kind', 'declaredMime', 'declaredSize', 'attempt',
    'requestId', 'status', 'requestedRange', 'rangeSatisfied', 'playbackMode',
    'bytes', 'totalBytes', 'mediaErrorCode', 'seekGeneration', 'currentTime',
    'targetTime', 'presentedMediaTime', 'tolerance', 'activeElapsedMs',
    'confidence', 'fromSession', 'toSession', 'terminal', 'stale'
  ];
  const sanitized = {};
  for (const key of allowed) {
    const value = details[key];
    if (value == null) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    }
  }
  return sanitized;
}

function emitMediaDiagnosticTraceStage(trace, stage, details = {}, session = state.mediaSession, {
  allowKnownSession = false,
  stale = false
} = {}) {
  const sink = getMediaDiagnosticSink();
  const numericSession = Number(session);
  const currentSession = Number(trace?.mediaSession);
  const knownSession = trace?.sessions?.has(numericSession);
  if (!trace || !sink || !Number.isFinite(numericSession)) return false;
  if (numericSession !== currentSession && !(allowKnownSession && knownSession)) return false;
  const at = mediaDiagnosticTimestamp();
  const event = {
    type: 'DRIVE_ORIGINAL_MEDIA_STAGE',
    version: 1,
    source: 'app',
    playbackId: trace.playbackId,
    traceId: trace.traceId,
    fileKey: trace.fileKey,
    mediaSession: String(numericSession),
    sequence: ++mediaDiagnosticSequence,
    at,
    elapsedMs: Math.max(0, at - trace.startedAt),
    stage: String(stage || 'unknown'),
    ...sanitizeMediaDiagnosticDetails(stale ? { ...details, stale: true } : details)
  };
  try { sink(event); } catch (_) { /* Diagnostics never change playback. */ }
  return true;
}

function emitMediaDiagnosticStage(stage, details = {}, session = state.mediaSession) {
  return emitMediaDiagnosticTraceStage(mediaDiagnosticTrace, stage, details, session);
}

function beginMediaDiagnosticTrace(file, session, startedAt = mediaDiagnosticTimestamp()) {
  if (!getMediaDiagnosticSink()) {
    mediaDiagnosticTrace = null;
    mediaDiagnosticRetiredTraces.clear();
    mediaDiagnosticDirectRequestOwners.clear();
    return null;
  }
  const ordinal = ++mediaDiagnosticPlaybackSequence;
  const playbackId = `playback-${startedAt.toString(36)}-${ordinal.toString(36)}`;
  mediaDiagnosticTrace = {
    playbackId,
    traceId: playbackId,
    fileKey: `file-${ordinal}`,
    mediaSession: Number(session),
    sessions: new Set([Number(session)]),
    startedAt,
    firstFrameSeen: false,
    playbackProgressSeen: false,
    seekGeneration: 0,
    directRequestSequence: 0,
    directRequests: new Map()
  };
  emitMediaDiagnosticStage('intent', {
    kind: file?.mimeType?.startsWith('video/') ? 'video' : 'image',
    declaredMime: String(file?.mimeType || ''),
    declaredSize: Number(file?.size) || 0
  }, session);
  return mediaDiagnosticTrace;
}

function updateMediaDiagnosticSession(session, reason) {
  const trace = mediaDiagnosticTrace;
  if (!trace) return;
  const previous = trace.mediaSession;
  trace.mediaSession = Number(session);
  trace.sessions.add(Number(session));
  emitMediaDiagnosticStage('session-changed', {
    reason,
    fromSession: Number(previous),
    toSession: Number(session)
  }, session);
}

function finishMediaDiagnosticTrace(reason = 'closed') {
  if (!mediaDiagnosticTrace) return;
  const trace = mediaDiagnosticTrace;
  emitMediaDiagnosticStage('trace-finished', { reason, terminal: true }, trace.mediaSession);
  mediaDiagnosticRetiredTraces.delete(trace.traceId);
  mediaDiagnosticRetiredTraces.set(trace.traceId, trace);
  while (mediaDiagnosticRetiredTraces.size > MEDIA_DIAGNOSTIC_RETIRED_TRACE_LIMIT) {
    const retiredTraceId = mediaDiagnosticRetiredTraces.keys().next().value;
    const retiredTrace = mediaDiagnosticRetiredTraces.get(retiredTraceId);
    for (const requestId of retiredTrace?.directRequests?.keys?.() || []) {
      mediaDiagnosticDirectRequestOwners.delete(requestId);
    }
    mediaDiagnosticRetiredTraces.delete(retiredTraceId);
  }
  mediaDiagnosticTrace = null;
}

function getMediaDiagnosticTraceId(session = state.mediaSession) {
  return mediaDiagnosticTrace && Number(mediaDiagnosticTrace.mediaSession) === Number(session)
    ? mediaDiagnosticTrace.traceId
    : '';
}

function beginDirectMediaDiagnosticRequest(session, attempt) {
  const trace = mediaDiagnosticTrace;
  if (!trace || Number(trace.mediaSession) !== Number(session)) return '';
  const requestId = `${trace.traceId}-direct-${++trace.directRequestSequence}`;
  trace.directRequests.set(requestId, {
    firstByte: false,
    lastProgressBytes: 0,
    lastProgressAt: mediaDiagnosticTimestamp()
  });
  mediaDiagnosticDirectRequestOwners.set(requestId, trace);
  emitMediaDiagnosticStage('request-start', {
    route: 'full-original', requestId, attempt
  }, session);
  return requestId;
}

function recordDirectMediaDiagnosticBytes(session, requestId, bytes, totalBytes) {
  const trace = mediaDiagnosticDirectRequestOwners.get(requestId);
  const request = trace?.directRequests?.get(requestId);
  const numericSession = Number(session);
  if (!request || !trace.sessions.has(numericSession)) return;
  const stale = trace !== mediaDiagnosticTrace || Number(trace.mediaSession) !== numericSession;
  if (!request.firstByte && bytes > 0) {
    request.firstByte = true;
    request.lastProgressAt = mediaDiagnosticTimestamp();
    emitMediaDiagnosticTraceStage(trace, 'first-byte', {
      route: 'full-original', requestId, bytes, totalBytes
    }, session, { allowKnownSession: true, stale });
  }
  const now = mediaDiagnosticTimestamp();
  if (
    bytes - request.lastProgressBytes >= 1024 * 1024
    || now - request.lastProgressAt >= MEDIA_DIAGNOSTIC_PROGRESS_INTERVAL_MS
    || (totalBytes > 0 && bytes >= totalBytes)
  ) {
    request.lastProgressBytes = bytes;
    request.lastProgressAt = now;
    emitMediaDiagnosticTraceStage(trace, 'body-progress', {
      route: 'full-original', requestId, bytes, totalBytes
    }, session, { allowKnownSession: true, stale });
  }
}

function emitDirectMediaDiagnosticStage(session, requestId, stage, details = {}, {
  terminal = false,
  finalize = terminal
} = {}) {
  if (!requestId) return false;
  const trace = mediaDiagnosticDirectRequestOwners.get(requestId);
  const numericSession = Number(session);
  if (!trace || !trace.sessions.has(numericSession)) return false;
  const stale = trace !== mediaDiagnosticTrace || Number(trace.mediaSession) !== numericSession;
  const emitted = emitMediaDiagnosticTraceStage(trace, stage, {
    route: 'full-original', requestId, ...details, terminal
  }, session, { allowKnownSession: true, stale });
  if (finalize) {
    trace.directRequests.delete(requestId);
    mediaDiagnosticDirectRequestOwners.delete(requestId);
  }
  return emitted;
}

function completeDirectMediaDiagnosticRequest(session, requestId, bytes, totalBytes) {
  if (!requestId) return;
  recordDirectMediaDiagnosticBytes(session, requestId, bytes, totalBytes);
  emitDirectMediaDiagnosticStage(session, requestId, 'body-complete', {
    bytes, totalBytes
  }, { finalize: true });
}

function forwardWorkerMediaDiagnostic(data) {
  const trace = data?.traceId === mediaDiagnosticTrace?.traceId
    ? mediaDiagnosticTrace
    : mediaDiagnosticRetiredTraces.get(data?.traceId);
  if (!trace || !MEDIA_DIAGNOSTIC_WORKER_STAGES.has(data?.stage)) return;
  const messageSession = Number(data.sessionId ?? data.mediaSession);
  if (!Number.isFinite(messageSession) || !trace.sessions.has(messageSession)) return;
  const stale = trace !== mediaDiagnosticTrace || messageSession !== Number(trace.mediaSession);
  emitMediaDiagnosticTraceStage(trace, data.stage, {
    route: 'range',
    requestId: String(data.requestId || ''),
    status: Number(data.status) || 0,
    requestedRange: String(data.requestedRange || ''),
    rangeSatisfied: data.rangeSatisfied === true,
    playbackMode: String(data.playbackMode || ''),
    bytes: Number(data.bytes) || 0,
    totalBytes: Number(data.totalBytes) || 0,
    reason: String(data.reason || ''),
    terminal: data.terminal === true
  }, messageSession, { allowKnownSession: true, stale });
}

function recordMediaDiagnosticSeekStart(
  video,
  seekGeneration = null,
  targetTime = Number(video?.currentTime) || 0
) {
  if (!isCurrentMediaEvent(video) || !mediaDiagnosticTrace) return;
  const generation = Number.isSafeInteger(seekGeneration) && seekGeneration > 0
    ? seekGeneration
    : mediaDiagnosticTrace.seekGeneration + 1;
  mediaDiagnosticTrace.seekGeneration = generation;
  emitMediaDiagnosticStage('seeking', {
    seekGeneration: generation,
    currentTime: Number(targetTime) || 0
  });
}

function recordMediaDiagnosticSeekEnd(video, seekGeneration = null, { ownedFrame = false } = {}) {
  const trace = mediaDiagnosticTrace;
  if (!trace || !isCurrentMediaEvent(video)) return;
  const session = state.mediaSession;
  const generation = Number.isSafeInteger(seekGeneration) && seekGeneration > 0
    ? seekGeneration
    : trace.seekGeneration;
  const sourceGeneration = mediaSourceGeneration;
  const targetTime = Number(video.currentTime) || 0;
  emitMediaDiagnosticStage('seeked', {
    seekGeneration: generation,
    currentTime: targetTime
  }, session);
  if (ownedFrame) return;
  if (typeof video.requestVideoFrameCallback === 'function') {
    video.requestVideoFrameCallback((_now, metadata) => {
      const mediaTime = Number(metadata?.mediaTime);
      if (
        !isCurrentMediaEvent(video) || state.mediaSession !== session
        || mediaSourceGeneration !== sourceGeneration
        || trace !== mediaDiagnosticTrace || trace.seekGeneration !== generation
        || !mediaSeekTimesMatch(mediaTime, targetTime)
      ) return;
      emitMediaDiagnosticStage('seek-frame', {
        seekGeneration: generation,
        currentTime: Number(video.currentTime) || 0,
        presentedMediaTime: mediaTime,
        confidence: 'decoded-frame'
      }, session);
    });
  } else {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (
        !isCurrentMediaEvent(video) || state.mediaSession !== session
        || mediaSourceGeneration !== sourceGeneration
        || trace !== mediaDiagnosticTrace || trace.seekGeneration !== generation
      ) return;
      emitMediaDiagnosticStage('seek-presentation-fallback', {
        seekGeneration: generation,
        currentTime: Number(video.currentTime) || 0,
        confidence: 'paint-only'
      }, session);
    }));
  }
}

window.addEventListener('DOMContentLoaded', init);

function consumeAuthCallbackError() {
  let url;
  try { url = new URL(location.href); }
  catch (_) { return null; }
  const values = url.searchParams.getAll('authError');
  if (!values.length) return null;
  url.searchParams.delete('authError');
  try {
    history.replaceState(history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch (_) {}
  if (values.length !== 1) return null;
  const code = values[0];
  if (!Object.hasOwn(AUTH_CALLBACK_ERROR_MESSAGES, code)) return null;
  const message = AUTH_CALLBACK_ERROR_MESSAGES[code];
  return typeof message === 'string' ? message : null;
}

function showAuthCallbackError(message) {
  if (!message || hasUsableToken()) return false;
  setAuthError(message);
  return true;
}

async function init() {
  const authCallbackError = consumeAuthCallbackError();
  if (location.search && location.search.includes('_update=')) {
    try {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('_update');
      history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
    } catch (_) {}
  }

  bindElements();
  bindEvents();
  setupPlayerChrome();
  setupTouchGestures();
  setupLibraryEdgeBackGesture();
  setupInfiniteScroll();
  cleanupStaleOriginalBuffers().catch(() => {});
  removeLegacyCredentialStorage();
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
  if (el.settingsAppVersion) el.settingsAppVersion.textContent = `v${APP_VERSION}`;

  setBootstrapAuthPending(true);
  await setupServiceWorker();

  if (state.demo) {
    setBootstrapAuthPending(false);
    startDemoMode();
  } else if (await requestSessionCredential({ background: true, force: true })) {
    setBootstrapAuthPending(false);
    showLibrary();
  } else {
    setBootstrapAuthPending(false);
    updateConnectionBadge();
    showSetup();
    showAuthCallbackError(authCallbackError);
  }
}

function bindElements() {
  const ids = [
    'brandButton', 'connectionBadge', 'settingsButton', 'settingsUpdateDot',
    'updateBanner', 'updateBannerText', 'bannerUpdateButton', 'closeBannerButton',
    'setupView', 'libraryView', 'authHint',
    'connectButton', 'openSetupHelp', 'librarySummary', 'refreshButton', 'searchInput',
    'sortSelect', 'libraryStatus', 'accountSyncStatus', 'fileGrid', 'emptyState', 'emptyStateTitle', 'emptyStateText', 'loadMoreButton',
    'selectionModeButton', 'selectionToolbar', 'selectionCountText', 'selectionSelectAllBtn',
    'selectionMoveBtn', 'selectionDeleteBtn', 'selectionCancelBtn',
    'infiniteScrollSentinel', 'infiniteScrollSpinner',
    'folderNav', 'breadcrumbTrail', 'folderUpButton', 'libraryTitle', 'folderStrip', 'folderMoreButton', 'edgeBackIndicator',
    'playerSheet', 'playerBackdrop', 'playerModal', 'playerTitle', 'topbarPrevBtn', 'topbarRandomBtn', 'topbarNextBtn',
    'topbarFavoriteBtn',
    'fullscreenButton', 'iconExpand', 'iconCompress', 'closePlayerButton',
    'mediaStage', 'ambientBackdrop', 'videoPlayer', 'imageViewer',
    'mediaSwipeNeighbor', 'mediaSwipeNeighborBackdrop', 'mediaSwipeNeighborImage', 'mediaSwipeNeighborTitle',
    'drivePreview', 'drivePreviewActions', 'drivePreviewRetryButton', 'drivePreviewOpenButton', 'playerControlsEntry', 'hidePlayerControlsButton', 'closeMediaErrorButton', 'playerFeedback', 'favoriteFeedback',
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
    'ctrlTracks', 'shortsTracksBtn', 'playerTracksDialog', 'playerTracksClose',
    'playerAudioTrack', 'playerSubtitleTrack', 'playerTracksStatus',
    'ctrlFavorite', 'ctrlPip', 'ctrlFullscreen', 'ctrlIconExpand', 'ctrlIconCompress',
    'mediaLoading', 'mediaLoadingText', 'mediaError', 'mediaErrorTitle', 'mediaErrorMessage',
    'retryMediaButton', 'bufferOriginalButton', 'videoCompatButton', 'compatPlayerButton', 'openDriveButton', 'streamModeLabel', 'streamModeText',
    'qualityBadge', 'mediaResolution',
    'mediaFileSizeType', 'codecNote', 'settingsDialog', 'settingsAppVersion',
    'updateStatusText', 'checkUpdateButton', 'applyUpdateButton', 'forceReloadButton',
    'logoutButton', 'disconnectButton', 'setupHelpSection',
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
  document.getElementById?.('reconnectButton')?.addEventListener('click', beginAuthorization);
  el.connectButton.addEventListener('click', beginAuthorization);
  el.openSetupHelp.addEventListener('click', () => openSettings(true));
  el.settingsButton.addEventListener('click', () => openSettings(false));
  el.brandButton.addEventListener('click', () => {
    closePlayer();
    if (state.token || state.demo) showLibrary();
  });
  el.refreshButton.addEventListener('click', () => {
    void recoverDriveMutations({ notifyResult: true }).catch(() => {});
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
  if (el.closePlayerButton) el.closePlayerButton.addEventListener('click', requestClosePlayer);
  if (el.playerBackdrop) el.playerBackdrop.addEventListener('click', requestClosePlayer);
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
  // The tap recognizer owns pairs; fullscreen has its explicit control.
  // Cancel native double-click defaults without changing the media scale.
  el.mediaStage.addEventListener('dblclick', (event) => event.preventDefault());
  el.mediaStage.addEventListener('click', onMediaStageClick);
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
  [el.ctrlTracks, el.shortsTracksBtn].forEach(button => button?.addEventListener('click', event => {
    event.stopPropagation(); void openPlayerTracks();
  }));
  el.playerTracksClose?.addEventListener('click', () => el.playerTracksDialog.close());
  el.playerAudioTrack?.addEventListener('change', () => void selectPlayerAudioTrack());
  el.playerSubtitleTrack?.addEventListener('change', () => {
    const owner = playerTracksOwner;
    if (!owner?.current() || !owner.presentation) return;
    try {
      owner.presentation.select(el.playerSubtitleTrack.value === '' ? null : Number(el.playerSubtitleTrack.value));
      el.playerTracksStatus.textContent = el.playerSubtitleTrack.value
        ? '텍스트 자막을 표시합니다. 원본 글꼴·꾸밈·배치는 적용하지 않습니다.' : '자막을 껐습니다.';
    } catch (_) { el.playerTracksStatus.textContent = '선택한 자막을 표시하지 못했습니다.'; }
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
    el.mobileShortsProgressTrack.addEventListener('keydown', onSeekKeyDown);
  }
  document.addEventListener('click', onDocumentClickForSpeedMenu);

  el.bannerUpdateButton.addEventListener('click', applyAppUpdate);
  el.closeBannerButton.addEventListener('click', () => { el.updateBanner.hidden = true; });
  el.checkUpdateButton.addEventListener('click', () => checkForAppUpdate({ manual: true }));
  el.applyUpdateButton.addEventListener('click', applyAppUpdate);
  el.forceReloadButton.addEventListener('click', forceReloadApp);

  el.retryMediaButton.addEventListener('click', retryMedia);
  el.bufferOriginalButton.addEventListener('click', confirmPendingMediaAction);
  el.videoCompatButton.addEventListener('click', () => {
    const choice=q3Choice; q3Choice=null; el.videoCompatButton.hidden=true;
    if(choice?.current()) void tryOriginalTsPlayback(choice.file,choice.session,
      {general:true,videoCompatibility:true,nativeVideoRejected:true,snapshotOverride:choice.snapshot});
  });
  el.compatPlayerButton.addEventListener('click', () => {
    if (state.selected) showDrivePreview(state.selected, '사용자 선택', { userInitiated: true });
  });
  el.closeMediaErrorButton.addEventListener('click', requestClosePlayer);
  el.openDriveButton.addEventListener('click', openSelectedInDrive);
  el.drivePreviewRetryButton.addEventListener('click', retryMedia);
  el.drivePreviewOpenButton.addEventListener('click', openSelectedInDrive);
  el.logoutButton.addEventListener('click', logout);
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
    beginAuthorization();
  });
  [el.settingsDialog, el.deleteDialog, el.moveDialog, el.permissionDialog].forEach((dialog) => bindDialogLightDismiss(dialog));
  window.addEventListener('online', () => {
    refreshForegroundCredential();
    updateConnectionBadge();
    updateAccountSyncStatus();
    if (state.accountId && state.accountStateSyncError) queueAccountStateSync();
    scheduleAccountStateRefresh(0);
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    resumeStandaloneAuthorization();
  });
  window.addEventListener('offline', () => {
    syncMediaSeekWatchdog();
    clearMediaFrameWatchdog('offline');
    stopAccountStateRefresh();
    updateConnectionBadge();
    updateAccountSyncStatus();
  });
  window.addEventListener('pagehide', stopAccountStateRefresh);
  window.addEventListener('pageshow', () => {
    refreshForegroundCredential();
    resumeMediaViewObservation();
    scheduleAccountStateRefresh(0);
    markStandaloneAuthorizationReturned({ pageshow: true });
    resumeStandaloneAuthorization();
  });
  window.addEventListener('blur', markStandaloneAuthorizationHidden);
  window.addEventListener('focus', () => {
    refreshForegroundCredential();
    markStandaloneAuthorizationReturned();
    resumeStandaloneAuthorization();
  });
  window.addEventListener('storage', (event) => {
    if (!state.accountId || state.accountIdentityPending || event.key !== accountStateCacheKey()) return;
    let cached;
    try { cached = readCachedAccountMediaState(state.accountId); }
    catch (error) { state.accountStateSyncError = error; updateAccountSyncStatus(); return; }
    const merged = mergeAccountMediaStates(cached, state.accountMediaState);
    if (accountMediaStatesEqual(merged, state.accountMediaState)) return;
    applyMergedAccountMediaState(merged);
    state.favoriteFiles = state.favoriteFiles.filter((file) => merged.favorites[file.id]?.liked);
    refreshFavoritePresentation();
    if (state.filter === 'favorites') loadFavoriteFiles({ refreshState: false });
  });
  window.addEventListener('scroll', () => {
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.classList.toggle('nav-scrolled', window.scrollY > 20);
    }
    scheduleRenderWindowUpdate();
  }, { passive: true });
  window.addEventListener('resize', scheduleRenderWindowUpdate, { passive: true });
  // Pointer/keyboard visibility is owned by setupPlayerChrome. Playback
  // events and general document activity never reveal controls.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumeMediaViewObservation();
      markStandaloneAuthorizationReturned();
      resumeStandaloneAuthorization();
      refreshForegroundCredential();
      checkForAppUpdate({ manual: false });
      scheduleAccountStateRefresh(0);
      syncMediaSeekWatchdog();
      syncMediaFrameWatchdog();
    } else {
      if (mediaViewObservation) mediaViewObservation.firstMediaTime = null;
      markStandaloneAuthorizationHidden();
      syncMediaSeekWatchdog();
      clearMediaFrameWatchdog('hidden');
      stopAccountStateRefresh();
    }
  });

  el.videoPlayer.addEventListener('loadedmetadata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    emitMediaDiagnosticStage('media-metadata', {
      currentTime: Number(event.currentTarget.currentTime) || 0,
      confidence: 'container-metadata'
    });
    updateVideoProgress();
    updatePlayPauseUI();
    beginVideoFrameSampling();
  });
  el.videoPlayer.addEventListener('canplay', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('canplay', { confidence: 'ready-state' });
      onMediaReady();
    }
  });
  el.videoPlayer.addEventListener('playing', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('playing', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
      onMediaReady();
      syncMediaFrameWatchdog();
    }
  });
  el.videoPlayer.addEventListener('timeupdate', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) { onVideoTimeUpdate(); refreshPlayerSubtitles(); }
  });
  el.videoPlayer.addEventListener('progress', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onVideoProgressUpdate();
  });
  el.videoPlayer.addEventListener('waiting', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('media-waiting', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
    }
  });
  el.videoPlayer.addEventListener('stalled', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('media-stalled', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
    }
  });
  el.videoPlayer.addEventListener('seeking', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    observeNativeMediaSeeking(event.currentTarget);
    playerTracksOwner?.presentation?.clear();
  });
  el.videoPlayer.addEventListener('seeked', refreshPlayerSubtitles);
  el.videoPlayer.addEventListener('seeked', handleVideoSeeked);
  el.videoPlayer.addEventListener('play', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    updatePlayPauseUI();
    beginVideoFrameSampling();
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('pause', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    syncMediaSeekWatchdog();
    clearMediaFrameWatchdog('paused');
    updatePlayPauseUI();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('ended', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    clearMediaSeekWatchdog('ended');
    clearMediaFrameWatchdog('ended');
  });
  el.videoPlayer.addEventListener('volumechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateVolumeUI();
  });
  el.videoPlayer.addEventListener('ratechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      syncMediaSeekWatchdog();
      updateSpeedUI();
    }
  });
  el.videoPlayer.addEventListener('resize', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateQualityDisplay();
  });
  el.videoPlayer.addEventListener('error', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    clearMediaSeekWatchdog('media-error');
    clearMediaFrameWatchdog('media-error');
    handleMediaElementError('video');
  });
  el.videoPlayer.addEventListener('loadeddata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    emitMediaDiagnosticStage('media-loaded-data', { confidence: 'decoded-current-frame' });
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
      setAuthError('압축을 푼 파일을 직접 열면 스트리밍할 수 없습니다. HTTPS 주소에 배포한 뒤 사용하세요.');
    }
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    showToast('HTTPS 환경이 아니어서 원본 스트리밍 기능을 시작할 수 없습니다.');
    return;
  }
  // The first controller claim can precede registration.ready. Install the
  // private owner receiver before starting registration or native playback.
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
  try {
    const registration = await withDeadline(navigator.serviceWorker.register('./sw.js', { scope: './' }), 12_000);
    state.serviceWorkerRegistration = registration;
    await withDeadline(navigator.serviceWorker.ready, 12_000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updatePending) {
        window.location.reload();
      } else {
        sendTokenToWorker();
        restartPendingMediaAfterServiceWorkerChange();
      }
    });

    sendTokenToWorker();
    setInterval(sendTokenToWorker, 20_000);

    // Initial check after 2 seconds, then every 5 minutes
    setTimeout(() => checkForAppUpdate({ manual: false }), 2000);
    setInterval(() => checkForAppUpdate({ manual: false }), 5 * 60 * 1000);
  } catch (error) {
    reportAppFailure('service-worker-registration', error, 'warn');
    if (!state.demo) showToast('원본 스트리밍 준비가 지연됩니다. 연결 상태를 확인한 뒤 새로고침하세요.');
  }
}

function restartPendingMediaAfterServiceWorkerChange() {
  const file = state.selected;
  const video = el.videoPlayer;
  const owner = q1Playback;
  if (owner && owner.swController !== navigator.serviceWorker?.controller
    && owner.fileId === file?.id && owner.session === state.mediaSession
    && owner.account === state.authAccountKey && owner.accountGeneration === state.driveSessionGeneration
    && el.playerSheet?.hidden === false) {
    const session = state.mediaSession, playbackSession = state.playbackSession,
      accountId = state.accountId, pin = q0PinnedSource,
      routeGeneration = ++initialMediaRouteGeneration;
    const snapshot = capturePlaybackSnapshot();
    if (snapshot) state.resumePosition = { fileId: file.id, time: snapshot.time, snapshot };
    state.pendingPlay = false;
    clearDirectMediaSources();
    const sourceGeneration = mediaSourceGeneration;
    state.mediaAttempt = 'worker-updating';
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    showMediaLoading('앱 업데이트 확인 중');
    void q1Retirement.then(() => {
      if (state.selected?.id !== file.id || state.mediaSession !== session
        || state.playbackSession !== playbackSession || state.accountId !== accountId
        || state.authAccountKey !== owner.account || state.driveSessionGeneration !== owner.accountGeneration
        || mediaSourceGeneration !== sourceGeneration || initialMediaRouteGeneration !== routeGeneration
        || q0PinnedSource !== pin || q0Playback || q1Playback || el.playerSheet?.hidden !== false
        || state.mediaAttempt !== 'worker-updating') return;
      // A replacement is not proof that the old worker's requests settled.
      // Keep the retirement result intact; only a fresh document may recover.
      state.mediaAttempt = 'worker-update-required';
      showMediaError('앱이 업데이트되어 원본 연결이 종료됐습니다. 앱을 다시 열어 재생하세요.',
        { title: '앱 다시 열기' });
    });
    return true;
  }
  if (
    !file?.mimeType?.startsWith('video/')
    || !['range', 'range-retry'].includes(state.mediaAttempt)
    || state.mediaTransportStarted === true
    || !video || video.hidden || !isCurrentMediaEvent(video)
  ) return false;

  return retryOriginalStream(
    file,
    state.mediaSession,
    '새 원본 스트림에 다시 연결하는 중',
    { consumeRetry: false }
  );
}

function withDeadline(operation, timeoutMs) {
  let timeout;
  return Promise.race([operation, new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('작업 응답 시간이 초과되었습니다.')), timeoutMs);
  })]).finally(() => clearTimeout(timeout));
}

function parseAppVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function isNewerVersion(remote, local) {
  const parsedRemote = parseAppVersion(remote);
  const parsedLocal = parseAppVersion(local);
  if (!parsedRemote || !parsedLocal) return false;
  for (let i = 0; i < 3; i++) {
    if (parsedRemote.core[i] > parsedLocal.core[i]) return true;
    if (parsedRemote.core[i] < parsedLocal.core[i]) return false;
  }
  const remotePre = parsedRemote.prerelease;
  const localPre = parsedLocal.prerelease;
  if (!remotePre.length || !localPre.length) return localPre.length > remotePre.length;
  for (let i = 0; i < Math.max(remotePre.length, localPre.length); i++) {
    if (remotePre[i] === undefined) return false;
    if (localPre[i] === undefined) return true;
    if (remotePre[i] === localPre[i]) continue;
    const remoteNumeric = /^\d+$/.test(remotePre[i]);
    const localNumeric = /^\d+$/.test(localPre[i]);
    if (remoteNumeric && localNumeric) return Number(remotePre[i]) > Number(localPre[i]);
    if (remoteNumeric !== localNumeric) return !remoteNumeric;
    return remotePre[i] > localPre[i];
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
  const generation = ++updateCheckGeneration;
  if (manual) updateCheckManualPending = true;
  const manualFeedback = updateCheckManualPending;
  const stillCurrent = () => generation === updateCheckGeneration;
  const controller = new AbortController();
  if (manual && el.updateStatusText) {
    el.updateStatusText.textContent = '최신 버전 확인 중…';
    if (el.checkUpdateButton) el.checkUpdateButton.disabled = true;
  }

  let remoteVersion = null;
  let releaseInfo = null;

  try {
    await withDeadline((async () => {
      // One deadline covers metadata/body and the non-cancellable worker check.
      const versionUrl = new URL(`version.json?_t=${Date.now()}`, location.href).href;
      const res = await fetch(versionUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        releaseInfo = await res.json();
        remoteVersion = releaseInfo.version;
      }
      if (!res.ok || !parseAppVersion(remoteVersion)) {
        throw new Error('유효한 최신 버전 정보를 받지 못했습니다.');
      }
      if (stillCurrent() && !controller.signal.aborted
        && 'serviceWorker' in navigator && state.serviceWorkerRegistration) {
        await state.serviceWorkerRegistration.update().catch(() => {});
      }
    })(), UPDATE_CHECK_TIMEOUT_MS);
    if (!stillCurrent()) return { hasUpdate: false, superseded: true };

    const hasNewVersion = Boolean(remoteVersion && isNewerVersion(remoteVersion, APP_VERSION));

    if (hasNewVersion) {
      notifyUpdateAvailable(remoteVersion, releaseInfo?.changeSummary);
      if (manualFeedback) {
        showToast(`새로운 버전(v${remoteVersion})이 준비되었습니다. [지금 업데이트]를 눌러 적용하세요.`);
      }
      return { hasUpdate: true, version: remoteVersion };
    }

    // No new update -> strictly hide all update indicators
    if (el.updateBanner) el.updateBanner.hidden = true;
    if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = true;
    if (el.applyUpdateButton) el.applyUpdateButton.hidden = true;

    if (manualFeedback) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      if (el.updateStatusText) {
        el.updateStatusText.textContent = `현재 최신 버전(v${APP_VERSION})을 사용 중입니다. (${timeStr} 확인)`;
      }
      showToast(`현재 최신 버전(v${APP_VERSION})입니다.`);
    }
    return { hasUpdate: false, version: APP_VERSION };
  } catch (err) {
    if (!stillCurrent()) return { hasUpdate: false, superseded: true };
    reportAppFailure('update-check', err);
    if (manualFeedback) {
      if (el.updateStatusText) el.updateStatusText.textContent = '업데이트 확인 중 오류가 발생했습니다.';
      showToast('업데이트 확인 실패: 네트워크를 확인하세요.');
    }
    return { hasUpdate: false, error: err };
  } finally {
    controller.abort();
    if (stillCurrent()) {
      if (updateCheckManualPending && el.checkUpdateButton) el.checkUpdateButton.disabled = false;
      updateCheckManualPending = false;
    }
  }
}

async function applyAppUpdate() {
  updatePending = true;
  showToast('최신 버전을 즉시 적용합니다…');
  // Other tabs can keep an unregistered worker alive. Re-registering that
  // worker need not install/claim again, leaving this new document uncontrolled.
  // Preserve the registered worker and complete shell; its network-first path
  // refreshes known shell bytes during this document's reload.

  // Force a hard network reload bypassing browser HTTP disk cache
  const target = new URL(location.href);
  target.searchParams.set('_update', Date.now().toString());
  location.replace(target.href);
}

function forceReloadApp() {
  if (appShellRefreshPending) return appShellRefreshPending;
  const owner = { account: state.authAccountKey, accountId: state.accountId,
    generation: state.driveSessionGeneration, mediaSession: state.mediaSession,
    playbackSession: state.playbackSession, selected: state.selected, pin: q0PinnedSource,
    q0: q0Playback, q1: q1Playback, sourceGeneration: mediaSourceGeneration,
    seekGeneration: mediaSeekGeneration, routeGeneration: initialMediaRouteGeneration };
  const current = () => !updatePending && owner.account === state.authAccountKey
    && owner.accountId === state.accountId && owner.generation === state.driveSessionGeneration
    && owner.mediaSession === state.mediaSession && owner.playbackSession === state.playbackSession
    && owner.selected === state.selected && owner.pin === q0PinnedSource
    && owner.q0 === q0Playback && owner.q1 === q1Playback
    && owner.sourceGeneration === mediaSourceGeneration && owner.seekGeneration === mediaSeekGeneration
    && owner.routeGeneration === initialMediaRouteGeneration;
  showToast('앱 캐시를 최신 파일로 새로고침합니다…');
  let timer, channel;
  const operation = (async () => {
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('shell-refresh-timeout')), APP_SHELL_REFRESH_TIMEOUT_MS);
      });
      const sw = navigator.serviceWorker;
      if (!sw || typeof MessageChannel !== 'function') throw new Error('shell-refresh-unsupported');
      const scope = new URL('./', location.href).href;
      const controller = sw.controller;
      const registration = await Promise.race([sw.getRegistration(scope), deadline]);
      const worker = controller || registration?.active;
      const workerURL = worker?.scriptURL ? new URL(worker.scriptURL) : null;
      const expectedURL = new URL('sw.js', scope);
      const workerCurrent = () => current() && sw.controller === controller
        && registration?.scope === scope && registration.active === worker && worker?.state === 'activated';
      if (!workerCurrent() || workerURL?.origin !== expectedURL.origin
        || workerURL?.pathname !== expectedURL.pathname || workerURL.search || workerURL.hash)
        throw new Error('shell-refresh-owner');
      channel = new MessageChannel();
      const requestId = `shell-${++appShellRefreshSequence}`;
      const acknowledgement = new Promise((resolve, reject) => {
        channel.port1.onmessage = event => {
          const data = event.data;
          if (!data || data.type !== 'APP_SHELL_REFRESH_RESULT' || data.protocol !== APP_SHELL_REFRESH_PROTOCOL
            || data.requestId !== requestId || data.ok !== true || !parseAppVersion(data.version)
            || isNewerVersion(APP_VERSION, data.version)) return reject(new Error('shell-refresh-rejected'));
          resolve(data);
        };
        channel.port1.onmessageerror = () => reject(new Error('shell-refresh-message'));
        worker.postMessage({ type: 'APP_SHELL_REFRESH', protocol: APP_SHELL_REFRESH_PROTOCOL, requestId }, [channel.port2]);
      });
      await Promise.race([acknowledgement, deadline]);
      if (!workerCurrent()) return false;
      updatePending = true;
      window.location.reload();
      return true;
    } catch (error) {
      if (current()) {
        reportAppFailure('shell-refresh', error);
        showToast('앱 캐시 새로고침에 실패했습니다. 네트워크를 확인하고 다시 시도하세요.');
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (channel) {
        channel.port1.onmessage = null;
        channel.port1.onmessageerror = null;
        channel.port1.close(); channel.port2.close();
      }
    }
  })();
  appShellRefreshPending = operation;
  void operation.finally(() => { if (appShellRefreshPending === operation) appShellRefreshPending = null; });
  return operation;
}

async function handleWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'Q0_OWNER_REQUEST' || data.type === 'Q0_PIN_REQUEST') {
    handleQ0PinMessage(event, data);
    return;
  }
  if (data.type === 'TOKEN_REQUEST' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    const requestGeneration = Number(data.accountGeneration);
    const mediaMatches = () => data.requireCurrentMedia !== true || (data.mediaOwner === 'q0' ? Boolean(
      data.q0PinProtocol === globalThis.DriveRevisionPin?.PROTOCOL
      && event.source === q0Playback?.swController
      && navigator.serviceWorker?.controller === q0Playback?.swController
      && isCurrentQ0Playback(q0Playback, data.fileId, data.sourceGeneration)
      && String(q0Playback.session) === data.mediaSession
    ) : Boolean(
      q1Playback && !q1Playback.controller.signal.aborted && state.mediaAttempt.startsWith('q1')
      && event.source === q1Playback.swController
      && navigator.serviceWorker?.controller === q1Playback.swController
      && state.selected?.id === data.fileId && String(state.mediaSession) === data.mediaSession
      && Number.isSafeInteger(data.sourceGeneration) && data.sourceGeneration === mediaSourceGeneration
    ));
    const accountMatches = !data.expectedAccount || data.expectedAccount === state.authAccountKey;
    const generationMatches = Number.isInteger(requestGeneration)
      && requestGeneration === state.driveSessionGeneration;
    let available = generationMatches && accountMatches && mediaMatches() && hasUsableToken();
    if (generationMatches && accountMatches && mediaMatches() && (!available || data.forceRefresh)) {
      available = await requestSessionCredential({
        background: true,
        force: true,
        rejectedRevision: data.forceRefresh && Number.isSafeInteger(data.rejectedRevision)
          ? data.rejectedRevision
          : null
      });
    }
    const stillCurrent = generationMatches
      && requestGeneration === state.driveSessionGeneration
      && accountMatches
      && (!data.expectedAccount || data.expectedAccount === state.authAccountKey)
      && mediaMatches();
    port.postMessage({
      type: 'TOKEN_RESPONSE',
      requestId: data.requestId,
      requestCurrent: stillCurrent,
      q1RetirementProtocol: data.requireCurrentMedia === true ? Q1_RETIRE_PROTOCOL : undefined,
      q0PinProtocol: data.mediaOwner === 'q0' ? globalThis.DriveRevisionPin?.PROTOCOL : undefined,
      credentialProtocol: AUTH_PROTOCOL,
      token: available && stillCurrent && hasUsableToken() && hasAuthCapability('driveRead') ? state.token : null,
      expiresAt: available && stillCurrent && hasUsableToken() && hasAuthCapability('driveRead') ? state.expiresAt : 0,
      account: available && stillCurrent && hasUsableToken() && hasAuthCapability('driveRead') ? state.authAccountKey : null,
      revision: available && stillCurrent && hasUsableToken() && hasAuthCapability('driveRead') ? state.tokenRevision : 0,
      accountGeneration: state.driveSessionGeneration
    });
    port.close?.();
    return;
  }
  if (data.type === 'MEDIA_TRACE_EVENT') {
    forwardWorkerMediaDiagnostic(data);
    return;
  }
  if (data.type === 'MEDIA_PROXY_STATUS') {
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (data.fileId && data.fileId !== state.selected?.id) return;
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    if (messageSourceGeneration != null && (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    )) return;
    if (
      !state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)
      || state.mediaPlaybackMode === PLAYBACK_MODE.COMPATIBILITY
    ) return;
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
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    return;
  }
  if (data.type === 'MEDIA_PROXY_PROGRESS') {
    if (data.stage !== 'first-byte') return;
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (data.fileId && data.fileId !== state.selected?.id) return;
    if (!Number.isFinite(messageSession) || messageSession !== state.mediaSession) return;
    if (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    ) return;
    if (!state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)) return;
    state.mediaTransportStarted = true;
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    return;
  }
  if (data.type === 'MEDIA_PROXY_ERROR') {
    if (data.fileId && data.fileId !== state.selected?.id) return;
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    if (messageSourceGeneration != null && (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    )) return;
    if (!state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)) return;
    clearMediaSeekWatchdog('proxy-error');
    clearMediaFrameWatchdog('proxy-error');
    state.lastProxyError = data;
    await recoverFromMediaProxyError(data);
  }
}

async function recoverFromMediaProxyError(data) {
  clearMediaSeekWatchdog('classified-failure');
  clearMediaFrameWatchdog('classified-failure');
  const retryFile = state.selected;
  if (!retryFile) return;
  const retrySession = state.mediaSession;
  const retrySourceGeneration = mediaSourceGeneration;
  const isVideo = isVideoPresentation(retryFile);
  if (classifyMediaProxyFailure(data) === 'source-pin') {
    retireQ0Playback();
    clearDirectMediaSources();
    state.mediaAttempt = 'failed';
    showMediaError('선택한 원본 버전을 안전하게 연결할 수 없습니다. 플레이어를 닫은 뒤 파일을 다시 열어 주세요.',
      { title: '원본 연결 확인 필요', showRetry: false });
    return;
  }
  if (isDriveSecurityRestriction(data) && !state.mediaAbuseAcknowledged) {
    state.mediaAttempt = 'security-confirmation';
    state.pendingSecurityConfirmation = {
      fileId: retryFile.id,
      session: retrySession,
      sourceGeneration: retrySourceGeneration,
      stage: 'range'
    };
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
    const refreshed = await requestSessionCredential({
      background: true,
      force: true,
      rejectedRevision: Number.isSafeInteger(data.rejectedRevision)
        ? data.rejectedRevision
        : state.tokenRevision
    });
    if (!isCurrentOriginalBufferOwner(retryFile, retrySession, retrySourceGeneration)) return;
    if (refreshed) {
      state.retryAfterAuth = false;
      state.authRetryContext = null;
      if (!retryOriginalStream(retryFile, retrySession, '연결 확인 완료 — 원본 스트림 다시 연결 중')) {
        await offerOriginalBufferFallback(
          retryFile,
          isVideo ? 'video' : 'image',
          retrySession,
          '원본 연결을 복구하지 못해',
          retrySourceGeneration
        );
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
    // A forbidden file does not invalidate the Google account session.
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
      : '원본 구간 스트림을 안정적으로 이어가지 못해',
    retrySourceGeneration
  );
}

function sendTokenToWorker() {
  if (!hasUsableToken() || !state.authAccountKey || !navigator.serviceWorker) return;
  const message = {
    type: hasAuthCapability('driveRead') ? 'SET_TOKEN' : 'CLEAR_TOKEN',
    credentialProtocol: AUTH_PROTOCOL,
    ...(hasAuthCapability('driveRead') ? { token: state.token, expiresAt: state.expiresAt } : {}),
    account: state.authAccountKey,
    revision: state.tokenRevision,
    accountGeneration: state.driveSessionGeneration
  };
  if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(message);
  const registration = state.serviceWorkerRegistration;
  [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
}

function removeLegacyCredentialStorage() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CLIENT_ID_STORAGE_KEY);
  } catch (_) {}
}

function normalizeAuthCapabilities(value) {
  if (!value || value.version !== 1 || ['driveRead', 'driveWrite', 'appData'].some(key => typeof value[key] !== 'boolean')
    || (value.driveWrite && !value.driveRead)) return null;
  return { version: 1, driveRead: value.driveRead, driveWrite: value.driveWrite, appData: value.appData };
}
function hasAuthCapability(feature) {
  return state.authCapabilities?.version === 1 && state.authCapabilities[feature] === true;
}
function missingScopeError(feature) {
  const error = new Error(feature === 'appData'
    ? '기록 동기화 권한이 필요합니다. 다시 연결해 주세요.'
    : '이 Drive 기능의 권한이 필요합니다. 다시 연결해 주세요.');
  error.code = 'insufficient_scope';
  error.feature = feature;
  error.status = 403;
  return error;
}

function normalizeSessionCredential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const capabilities = normalizeAuthCapabilities(value.capabilities);
  if (!capabilities) return null;
  const accessToken = typeof value.accessToken === 'string' ? value.accessToken : '';
  const expiresAt = value.expiresAt;
  const account = typeof value.account === 'string' ? value.account : '';
  const revision = value.revision;
  const sessionMarker = value.sessionMarker == null ? null : value.sessionMarker;
  if (!accessToken || accessToken.length > 16_384) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_SKEW_MS) return null;
  if (!account || account.length > 256 || /[\s\x00-\x1f\x7f]/.test(account)) return null;
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  if (sessionMarker != null && (typeof sessionMarker !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(sessionMarker))) return null;
  return { accessToken, expiresAt, account, revision, sessionMarker, capabilities };
}

function authErrorCode(value, fallback = 'auth_unavailable') {
  const code = typeof value?.error?.code === 'string' ? value.error.code : '';
  return AUTH_ERROR_CODES.has(code) ? code : fallback;
}

async function readAuthJson(response, { onTransportFailure } = {}) {
  const contentType = response.headers?.get?.('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try { return await response.json(); }
  catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TypeError') onTransportFailure?.();
    return null;
  }
}

function installSessionCredential(value, { generation, rejectedRevision = null } = {}) {
  const credential = normalizeSessionCredential(value);
  if (!credential || generation !== state.authGeneration) return false;
  if (state.authAccountKey && credential.account !== state.authAccountKey) return false;
  if (Number.isSafeInteger(rejectedRevision) && credential.revision <= rejectedRevision) return false;
  if (credential.account === state.authAccountKey && credential.revision < state.tokenRevision) return false;
  if (credential.account === state.authAccountKey && credential.revision === state.tokenRevision
    && state.token && (credential.accessToken !== state.token
      || JSON.stringify(credential.capabilities) !== JSON.stringify(state.authCapabilities))) return false;
  state.authCapabilities = credential.capabilities;
  if (!hasAuthCapability('appData')) {
    state.accountStateAbortController?.abort();
    state.accountStateAbortController = null;
    stopAccountStateRefresh();
    clearTimeout(state.accountStateSyncTimer);
    clearTimeout(state.accountStateSyncRetryTimer);
    state.accountStateSyncTimer = state.accountStateSyncRetryTimer = null;
    state.accountStateLoaded = false;
    state.accountStateSyncError = missingScopeError('appData');
    updateAccountSyncStatus();
  }
  state.authAccountKey = credential.account;
  state.token = credential.accessToken;
  state.expiresAt = credential.expiresAt;
  state.tokenRevision = credential.revision;
  sessionCredentialMarker = credential.sessionMarker;
  state.authStatus = 'online';
  scheduleTokenRenewal();
  clearAuthError();
  sendTokenToWorker();
  updateConnectionBadge();
  resumeAfterCredential(generation);
  return true;
}

function resumeAfterCredential(generation) {
  setTimeout(async () => {
    if (generation !== state.authGeneration || !hasUsableToken()) return;
    if (!state.accountStateLoaded) {
      await initializeAccountMediaState().catch((error) => {
        reportAppFailure('account-state-sync', error, 'warn');
      });
    }
    if (generation !== state.authGeneration || state.accountIdentityPending) return;
    state.accountStateRefreshBlocked = !hasAuthCapability('appData');
    scheduleAccountStateRefresh(0);
    if (!hasAuthCapability('driveRead')) return;
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
}

function scheduleTokenRenewal() {
  if (tokenRenewalTimer !== null) clearTimeout(tokenRenewalTimer);
  tokenRenewalTimer = null;
  if (!state.token || !state.expiresAt) return;
  const generation = state.authGeneration;
  const account = state.authAccountKey;
  const revision = state.tokenRevision;
  const expiresAt = state.expiresAt;
  const current = () => generation === state.authGeneration && account === state.authAccountKey
    && revision === state.tokenRevision && expiresAt === state.expiresAt && Boolean(state.token);
  const schedule = (delay, retry = false) => {
    const timer = setTimeout(async () => {
      if (tokenRenewalTimer !== timer) return;
      tokenRenewalTimer = null;
      if (!current() || (retry && (!navigator.onLine || document.visibilityState === 'hidden'))) return;
      // A cached success is not renewal. Require the existing owner to advance
      // its revision while leaving enough runway for the entire bounded flight.
      const request = requestSessionCredential({ background: true, force: true, rejectedRevision: revision });
      const outcome = credentialRequestOutcome;
      const refreshed = await request;
      if (refreshed || !current() || outcome !== credentialRequestOutcome
        || outcome?.generation !== generation || !outcome.retryable || tokenRenewalTimer !== null
        || !navigator.onLine || document.visibilityState === 'hidden') return;
      schedule(15_000, true);
    }, delay);
    tokenRenewalTimer = timer;
  };
  schedule(Math.max(1_000, expiresAt - Date.now() - TOKEN_SKEW_MS - AUTH_CREDENTIAL_TIMEOUT_MS - 5_000));
}

function refreshForegroundCredential() {
  if (document.visibilityState === 'hidden' || !navigator.onLine) return;
  // Timers may have stopped during suspension or a history restore. All return
  // events share the existing auth owner; none opens a login popup or a player.
  if (state.token && state.expiresAt) {
    if (state.expiresAt - Date.now() < 5 * 60 * 1000) {
      requestSessionCredential({ background: true, force: true });
    } else {
      scheduleTokenRenewal();
    }
  }
  sendTokenToWorker();
}

function isIOSStandaloneWebApp() {
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  if (!appleMobile) return false;
  if (navigator.standalone === true) return true;
  try { return window.matchMedia?.('(display-mode: standalone)')?.matches === true; }
  catch (_) { return false; }
}

function clearStandaloneAuthAttempt(attempt = standaloneAuthAttempt) {
  if (!attempt || standaloneAuthAttempt !== attempt) return false;
  if (attempt.timer != null) clearTimeout(attempt.timer);
  if (attempt.deadlineTimer != null) clearTimeout(attempt.deadlineTimer);
  attempt.timer = null;
  attempt.deadlineTimer = null;
  standaloneAuthAttempt = null;
  return true;
}

function completeStandaloneAuthorization(attempt) {
  if (!clearStandaloneAuthAttempt(attempt)) return false;
  setConnectBusy(false);
  clearAuthError();
  showLibrary();
  return true;
}

function failStandaloneAuthorization(attempt, message) {
  if (!clearStandaloneAuthAttempt(attempt)) return false;
  setConnectBusy(false);
  if (hasUsableToken()) {
    showLibrary();
    showToast(message);
  } else {
    showSetup();
    setAuthError(message);
  }
  return true;
}

function expireStandaloneAuthorization(attempt) {
  if (!attempt || standaloneAuthAttempt !== attempt) return false;
  if (attempt.probePromise) {
    state.authGeneration += 1;
    credentialRequestAbortController?.abort();
    credentialRequestAbortController = null;
    credentialRequestPromise = null;
    credentialRequestGeneration = -1;
    credentialRequestOutcome = null;
  }
  return failStandaloneAuthorization(
    attempt,
    'Google 로그인 시간이 만료되었습니다. 홈 화면 앱 안에서 다시 시도해 주세요.'
  );
}

function markStandaloneAuthorizationHidden() {
  const attempt = standaloneAuthAttempt;
  if (!attempt) return false;
  attempt.awayObserved = true;
  if (attempt.timer != null) clearTimeout(attempt.timer);
  attempt.timer = null;
  return true;
}

function markStandaloneAuthorizationReturned({ pageshow = false } = {}) {
  const attempt = standaloneAuthAttempt;
  if (!attempt || (!pageshow && !attempt.awayObserved)) return false;
  attempt.awayObserved = false;
  attempt.returnEpoch += 1;
  attempt.nextProbe = 0;
  attempt.waitingForReturn = false;
  return true;
}

function resumeStandaloneAuthorization() {
  const attempt = standaloneAuthAttempt;
  if (!attempt || document.visibilityState === 'hidden' || attempt.returnEpoch < 1) return false;
  if (attempt.timer != null || attempt.probePromise) return true;
  const delay = AUTH_STANDALONE_RECOVERY_DELAYS_MS[attempt.nextProbe];
  if (!Number.isFinite(delay)) {
    attempt.waitingForReturn = true;
    setConnectBusy(true, 'Google 로그인 완료를 기다리는 중…');
    return true;
  }
  setConnectBusy(true, 'Google 로그인 결과 확인 중…');
  attempt.timer = setTimeout(async () => {
    attempt.timer = null;
    if (standaloneAuthAttempt !== attempt) return;
    if (document.visibilityState === 'hidden') return;
    attempt.nextProbe += 1;
    let connected = false;
    try {
      attempt.probePromise = requestSessionCredential({ background: true, force: true });
      connected = await attempt.probePromise;
    } catch (_) {
      connected = false;
    } finally {
      if (standaloneAuthAttempt === attempt) attempt.probePromise = null;
    }
    if (standaloneAuthAttempt !== attempt) return;
    const newSessionProved = connected && hasUsableToken()
      && typeof sessionCredentialMarker === 'string'
      && sessionCredentialMarker !== attempt.baselineSessionMarker;
    if (newSessionProved) {
      completeStandaloneAuthorization(attempt);
      return;
    }
    if (document.visibilityState === 'hidden') {
      attempt.nextProbe = Math.max(0, attempt.nextProbe - 1);
      return;
    }
    if (attempt.nextProbe >= AUTH_STANDALONE_RECOVERY_DELAYS_MS.length) {
      attempt.waitingForReturn = true;
      setConnectBusy(true, 'Google 로그인 완료를 기다리는 중…');
      return;
    }
    resumeStandaloneAuthorization();
  }, delay);
  return true;
}

function beginAuthorization() {
  if (!navigator.onLine) {
    setAuthError('오프라인에서는 Google 계정 연결을 시작할 수 없습니다.');
    return;
  }
  if (standaloneAuthAttempt) {
    setAuthError('열려 있는 Google 로그인 창을 완료한 뒤 이 화면으로 돌아오세요.');
    return;
  }
  clearAuthError();
  setConnectBusy(true);
  const target = new URL(AUTH_START_PATH, location.origin);
  target.searchParams.set('returnTo', `${location.pathname}${location.search}${location.hash}`);
  if (isIOSStandaloneWebApp()) {
    const attempt = {
      baselineSessionMarker: sessionCredentialMarker,
      awayObserved: false,
      returnEpoch: 0,
      waitingForReturn: false,
      nextProbe: 0,
      timer: null,
      probePromise: null,
      deadlineTimer: null
    };
    standaloneAuthAttempt = attempt;
    setConnectBusy(true, 'Google 로그인 진행 중…');
    let authWindow = null;
    try { authWindow = window.open(target.href, '_blank'); }
    catch (_) {}
    if (!authWindow) {
      failStandaloneAuthorization(
        attempt,
        'Google 로그인 창을 열지 못했습니다. 팝업을 허용한 뒤 다시 시도해 주세요.'
      );
      return;
    }
    try { authWindow.opener = null; } catch (_) {}
    attempt.deadlineTimer = setTimeout(() => {
      expireStandaloneAuthorization(attempt);
    }, AUTH_STANDALONE_DEADLINE_MS);
    attempt.deadlineTimer?.unref?.();
    return;
  }
  location.assign(target.href);
}

async function fetchSessionCredentialWithRetry(url, options, outcome) {
  const delays = [1_250, 2_500];
  const ensureCurrent = () => {
    options.signal.throwIfAborted();
    if (outcome.generation !== state.authGeneration || outcome.account !== state.authAccountKey) {
      throw new DOMException('Credential owner changed', 'AbortError');
    }
  };
  for (let attempt = 0; ; attempt++) {
    ensureCurrent();
    let response, failure;
    try { response = await fetch(url, options); }
    catch (error) { failure = error; }
    ensureCurrent();
    const payload = response?.status === 503 ? await readAuthJson(response.clone()) : null;
    ensureCurrent();
    outcome.retryable = failure?.name === 'TypeError'
      || (response?.status === 503 && authErrorCode(payload) === 'auth_unavailable');
    if (!outcome.retryable || attempt >= delays.length || !navigator.onLine) {
      if (failure) throw failure;
      return response;
    }
    // Only the same-origin auth POST retries; Drive reads and mutations retain
    // their own owners. All attempts share the caller's original total deadline.
    void response?.body?.cancel()?.catch(() => {});
    await new Promise((resolve, reject) => {
      let timer;
      const finish = (error) => {
        clearTimeout(timer);
        options.signal.removeEventListener('abort', onAbort);
        error ? reject(error) : resolve();
      };
      const onAbort = () => finish(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      options.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => finish(), delays[attempt]);
      if (options.signal.aborted) onAbort();
    });
  }
}

function requestSessionCredential({ background = false, force = false, rejectedRevision = null } = {}) {
  if (!force && hasUsableToken()) return Promise.resolve(true);
  if (!navigator.onLine) {
    credentialRequestOutcome = { generation: state.authGeneration, retryable: true };
    state.authStatus = 'auth-unavailable';
    updateConnectionBadge();
    return Promise.resolve(false);
  }
  const generation = state.authGeneration;
  const rejected = rejectedRevision == null
    ? null
    : Number.isSafeInteger(Number(rejectedRevision)) ? Number(rejectedRevision) : null;
  if (credentialRequestPromise) {
    const priorRequest = credentialRequestPromise;
    return priorRequest.catch(() => false).then((connected) => {
      if (generation !== state.authGeneration) return false;
      if (!connected) return false;
      if (connected && hasUsableToken() && (rejected == null || state.tokenRevision > rejected)) return true;
      if (rejected == null || !hasUsableToken()) return false;
      if (credentialRequestGeneration !== -1) {
        return new Promise((resolve) => queueMicrotask(() => {
          resolve(requestSessionCredential({ background, force, rejectedRevision: rejected }));
        }));
      }
      return requestSessionCredential({ background, force, rejectedRevision: rejected });
    });
  }
  if (!background) {
    setConnectBusy(true);
    updateConnectionBadge('busy');
  }

  const operation = (async () => {
    const controller = new AbortController();
    credentialRequestAbortController = controller;
    const outcome = { generation, account: state.authAccountKey, retryable: true };
    credentialRequestOutcome = outcome;
    const timeout = setTimeout(() => {
      // Headers alone do not complete a credential flight. Preserve recovery
      // for its total deadline, including a stalled successful response body.
      if (outcome.responseOk !== false) outcome.retryable = true;
      controller.abort();
    }, AUTH_CREDENTIAL_TIMEOUT_MS);
    try {
      const response = await fetchSessionCredentialWithRetry(new URL(AUTH_CREDENTIAL_PATH, location.origin), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        mode: 'same-origin',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          [AUTH_CSRF_HEADER]: '1'
        },
        body: JSON.stringify({ expectedAccount: state.authAccountKey, rejectedRevision: rejected, credentialProtocol: 2 }),
        signal: controller.signal
      }, outcome);
      if (generation !== state.authGeneration) return false;
      outcome.responseOk = response.ok;
      const payload = await readAuthJson(response, {
        onTransportFailure: () => { if (response.ok) outcome.retryable = true; }
      });
      if (generation !== state.authGeneration) return false;
      if (!response.ok) {
        const code = authErrorCode(payload);
        state.authStatus = code === 'unauthorized' ? 'anonymous'
          : code === 'reconnect_required' || code === 'account_mismatch' ? 'reconnect-required'
            : 'auth-unavailable';
        if (state.token && ['unauthorized', 'reconnect_required', 'account_mismatch'].includes(code)) {
          clearToken(true, { preserveAccount: true });
        }
        if (!background && code !== 'unauthorized') {
          setAuthError(code === 'reconnect_required' || code === 'account_mismatch'
            ? 'Google 계정을 다시 연결해야 합니다.'
            : code === 'client_update_required' ? '앱을 새로 고친 뒤 다시 시도해 주세요.'
              : '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        return false;
      }
      const installed = installSessionCredential(payload, { generation, rejectedRevision: rejected });
      if (!installed) state.authStatus = 'auth-unavailable';
      return installed;
    } catch (error) {
      if (error?.name !== 'AbortError') state.authStatus = 'auth-unavailable';
      if (!background && error?.name !== 'AbortError') {
        setAuthError('인증 서비스에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (credentialRequestAbortController === controller) credentialRequestAbortController = null;
      if (!background) setConnectBusy(false);
      updateConnectionBadge();
    }
  })();

  credentialRequestPromise = operation;
  credentialRequestGeneration = generation;
  operation.finally(() => {
    if (credentialRequestPromise === operation) {
      credentialRequestPromise = null;
      credentialRequestGeneration = -1;
    }
  });
  return operation;
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
  if (!hasUsableToken()) {
    showReconnectState();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return false;
  }

  if (!append) resetListingSession();
  const generation = state.listGeneration;
  const controller = state.listAbortController;
  state.loadingFiles = true;
  showLibrary();
  const requestStatusToken = statusToken ?? beginLibraryStatus(
    append ? '' : 'Drive에서 폴더와 원본 파일 목록을 불러오는 중…'
  );
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
    updateLibraryStatus(requestStatusToken, '');
    return true;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.listGeneration) {
      return false;
    }
    reportAppFailure('library-list', error);
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
  clearLibraryStatus();
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
  if (!folderId || state.bulkAction) return;
  if (folderId === state.currentFolderId) return;
  beginLibraryNavigation();
  // The breadcrumb always renders root as the first crumb; keep it out of the stack.
  if (state.currentFolderId !== 'root') {
    state.folderStack.push({ id: state.currentFolderId, name: state.currentFolderName });
  }
  state.currentFolderId = folderId;
  state.currentFolderName = folderName || '폴더';
  resetListingSession();
  scrollToLibraryTop();
  commitLibraryNavigation();
  animateFolderTransition('forward');
  applyFolderView();
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
  if (state.bulkAction) return;
  const previous = libraryNavigation.entries.get(libraryNavigation.order[libraryNavigation.cursor - 1]);
  if (hasOwnedLibraryBackEntry() && previous?.view.currentFolderId === target.id) {
    completeLibraryBackNavigation(); return;
  }
  beginLibraryNavigation();
  state.folderStack = crumbs.slice(1, index);
  state.currentFolderId = target.id;
  state.currentFolderName = target.name;
  resetListingSession();
  scrollToLibraryTop();
  commitLibraryNavigation();
  animateFolderTransition('back');
  applyFolderView();
}

function navigateToParentFolder() {
  if (state.bulkAction) return;
  if (!state.folderStack.length && state.currentFolderId === 'root') return;
  const parentId = state.folderStack.at(-1)?.id || 'root';
  const previous = libraryNavigation.entries.get(libraryNavigation.order[libraryNavigation.cursor - 1]);
  if (hasOwnedLibraryBackEntry() && previous?.view.currentFolderId === parentId) {
    completeLibraryBackNavigation(); return;
  }
  beginLibraryNavigation();
  const parent = state.folderStack.length
    ? state.folderStack.pop()
    : { id: 'root', name: '내 드라이브' };
  state.currentFolderId = parent.id;
  state.currentFolderName = parent.name;
  resetListingSession();
  scrollToLibraryTop();
  commitLibraryNavigation();
  animateFolderTransition('back');
  applyFolderView();
}

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
    if (el.refreshButton) el.refreshButton.disabled = false;
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
  if (libraryNavigation.pending || state.bulkAction) return;
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
  const previous = libraryNavigation.entries.get(libraryNavigation.order[libraryNavigation.cursor - 1])?.visual;
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
    if (commit && !state.bulkAction && !document.querySelector('dialog[open]')) {
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
    && gesture.filter === state.filter && !state.bulkAction
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
    if (!isMobileDevice() || !el.libraryView || el.libraryView.hidden || state.bulkAction || playerHistoryPending) return;
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
    ensureTreeCache().then(() => {
      if (state.deepScan) computeAndRenderSubtree();
    });
    return;
  }
  const generation = state.listGeneration + 1;
  const loaded = await loadFiles({ append: false });
  if (!loaded || generation !== state.listGeneration || state.sort !== 'random') return;
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
    showReconnectState();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return;
  }
  state.loadingTree = true;
  const controller = new AbortController();
  state.treeAbort = controller;
  if (el.deepScanToggle) el.deepScanToggle.disabled = true;
  if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = false;
  const statusToken = beginLibraryStatus('드라이브 전체 폴더 트리를 수집하는 중…');
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
      updateLibraryStatus(statusToken, `드라이브 전체 폴더 트리 수집 중… ${items.length.toLocaleString('ko-KR')}개 항목`);
    } while (pageToken);
    state.treeCache = buildTreeIndexes(items);
    updateLibraryStatus(statusToken, '');
    return state.treeCache;
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      // 사용자가 중지 버튼으로 취소 — 부분 데이터는 폐기하고 일반 모드로 복귀한다.
      updateLibraryStatus(statusToken, '폴더 트리 수집을 중단했습니다.');
      state.deepScan = false;
      syncDeepScanToggle();
      applyFolderView();
      return;
    }
    reportAppFailure('library-tree', error);
    updateLibraryStatus(statusToken, `하위 폴더 전체를 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    if (error.status === 401) {
      clearRejectedToken(error);
      showReconnectState();
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
  clearLibraryStatus();
  updateLibrarySummary();
}

async function setLibraryFilter(filter) {
  if (state.bulkAction) return;
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
        fields: FAVORITE_FILE_FIELDS
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
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError' || generation !== state.favoriteLoadGeneration) return;
    reportAppFailure('favorite-files-load', error);
    nextStatus = `좋아요 항목을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
  } finally {
    if (generation === state.favoriteLoadGeneration && state.filter === 'favorites') {
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

function parseRetryAfterMs(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const milliseconds = Number(raw) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : Number.MAX_SAFE_INTEGER;
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp - now);
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }
    const deadline = Date.now() + Math.max(0, Number(delayMs) || 0);
    let timer;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, MAX_ORIGINAL_RETRY_AFTER_MS));
      else { cleanup(); resolve(); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    tick();
  });
}

function assertDriveRequestOwner(generation, signal, dataGeneration = state.driveSessionGeneration) {
  if (signal?.aborted || generation !== state.authGeneration || dataGeneration !== state.driveSessionGeneration) {
    throw new DOMException('Drive request belongs to a closed account session', 'AbortError');
  }
}

function requestDriveCredential(options, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Drive request cancelled', 'AbortError'));
  const pending = requestSessionCredential(options);
  if (!signal) return pending;
  // A media consumer can leave without cancelling the shared account refresh.
  // Settle its callback promptly so a closed source can prove its cleanup.
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new DOMException('Drive request cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

async function driveFetch(url, options = {}, _retried = false, _rateAttempt = 0, generation = state.authGeneration, dataGeneration = state.driveSessionGeneration) {
  const assertOwner = () => assertDriveRequestOwner(generation, options.signal, dataGeneration);
  assertOwner();
  const maxRateAttempts = Math.max(1, Math.min(3, Number(options.driveMaxRateAttempts) || 3));
  const requestOptions = { ...options };
  delete requestOptions.driveMaxRateAttempts;
  delete requestOptions.driveNoRetry;
  const accountStateRead = requestOptions[ACCOUNT_STATE_READ] === true;
  delete requestOptions[ACCOUNT_STATE_READ];
  const accountStateResponse = requestOptions[ACCOUNT_STATE_READ_RESPONSE];
  delete requestOptions[ACCOUNT_STATE_READ_RESPONSE];
  const accountStateWrite = requestOptions[ACCOUNT_STATE_WRITE];
  delete requestOptions[ACCOUNT_STATE_WRITE];
  const disposablePermit = requestOptions[DISPOSABLE_DRIVE_MUTATION];
  delete requestOptions[DISPOSABLE_DRIVE_MUTATION];
  const requestMethod = String(requestOptions.method || 'GET').toUpperCase();
  const stateWriteAllowed = isAccountStateWriteRequest(url, requestMethod, accountStateWrite);
  const disposableWriteAllowed = disposablePermit !== undefined
    && disposableDriveMutations.consume(disposablePermit, url, options);
  if (!DRIVE_MUTATIONS_ENABLED && !['GET', 'HEAD'].includes(requestMethod) && !stateWriteAllowed && !disposableWriteAllowed) {
    const error = new Error('Candidate Drive mutations are disabled until state verification completes.');
    error.code = 'candidate_read_only';
    error.status = 423;
    throw error;
  }
  if (!hasUsableToken()) {
    if (disposableWriteAllowed) throw driveMutationError('failed', '일회용 검증 권한이 만료되었습니다.', 401);
    if (!_retried) {
      await requestDriveCredential({ background: true, force: true }, options.signal);
      assertOwner();
      if (hasUsableToken()) return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
    }
    const error = new Error('Google 인증이 만료되었습니다.');
    error.status = 401;
    throw error;
  }
  const aboutRequest = new URL(url, location.href).pathname === '/drive/v3/about' && requestMethod === 'GET';
  const feature = accountStateWrite || accountStateRead ? 'appData' : ['GET', 'HEAD'].includes(requestMethod) ? 'driveRead' : 'driveWrite';
  if (!(aboutRequest && (hasAuthCapability('driveRead') || hasAuthCapability('appData'))) && !hasAuthCapability(feature)) throw missingScopeError(feature);
  const requestToken = state.token;
  const requestTokenRevision = state.tokenRevision || 0;
  const response = await fetch(url, {
    ...requestOptions,
    ...(disposableWriteAllowed ? { redirect: 'error', credentials: 'omit' } : {}),
    cache: 'no-store',
    headers: { ...(requestOptions.headers || {}), Authorization: `Bearer ${state.token}` }
  });
  if (accountStateRead && requestMethod === 'GET') accountStateResponse?.(response);
  try { assertOwner(); } catch (error) {
    response.body?.cancel().catch(() => {});
    throw error;
  }
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    assertOwner();
    if (response.status === 401 && !_retried && !options.driveNoRetry) {
      // A concurrent request may already have replaced the rejected token.
      if (((state.tokenRevision || 0) !== requestTokenRevision || state.token !== requestToken) && hasUsableToken()) {
        return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
      }
      const refreshed = await requestDriveCredential({
        background: true,
        force: true,
        rejectedRevision: requestTokenRevision
      }, options.signal);
      assertOwner();
      if (refreshed && hasUsableToken()) return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
      if ((state.tokenRevision || 0) === requestTokenRevision && state.token === requestToken) clearToken(true);
    }
    const reasons = (body?.error?.errors || []).map((item) => item?.reason).filter(Boolean);
    const rateLimited = response.status === 429
      || (response.status === 403 && reasons.some((reason) => /rateLimitExceeded/i.test(reason)));
    if (rateLimited && !options.driveNoRetry && _rateAttempt < maxRateAttempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      const delayMs = retryAfterMs || 500 * (2 ** _rateAttempt) + Math.floor(Math.random() * 250);
      await waitForRetry(delayMs, options.signal);
      return driveFetch(url, options, _retried, _rateAttempt + 1, generation, dataGeneration);
    }
    const detail = body?.error?.message || response.statusText || '';
    const error = new Error(detail || `Drive API ${response.status}`);
    error.status = response.status;
    error.rejectedTokenRevision = requestTokenRevision;
    error.rejectedAccountGeneration = dataGeneration;
    error.reasons = reasons;
    error.driveReason = reasons[0] || '';
    error.retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    throw error;
  }
  // Metadata consumers may still be awaiting JSON after headers arrive. Guard
  // that final async boundary as well, without buffering any media stream.
  const readJson = response.json.bind(response);
  response.json = async () => {
    assertOwner();
    const data = await readJson();
    assertOwner();
    return data;
  };
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
    const text = localStorage.getItem(key);
    if (text === null) return createEmptyAccountMediaState();
    return normalizeAccountMediaState(validateRawAccountMediaState(JSON.parse(text), true));
  } catch (_) {
    state.accountLocalStorageError = true;
    throw accountStateError('invalid_account_state_cache');
  }
}

function persistAccountMediaState() {
  const key = accountStateCacheKey();
  if (!key) return;
  try {
    applyMergedAccountMediaState(mergeAccountMediaStates(readCachedAccountMediaState(state.accountId), state.accountMediaState));
    localStorage.setItem(key, JSON.stringify(normalizeAccountMediaState(state.accountMediaState)));
    state.accountLocalStorageError = false;
  } catch (_) { state.accountLocalStorageError = true; }
}

function getAccountStateWriterId() {
  if (state.accountStateWriterId) return state.accountStateWriterId;
  const unique = () => globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  // A browser installation shares one writer only when its tabs can acquire
  // the same lock. Otherwise each running context owns a separate file.
  if (navigator.locks?.request) {
    try {
      let id = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
      if (!/^[A-Za-z0-9_-]{8,100}$/.test(id || '')) {
        id = unique();
        localStorage.setItem(ACCOUNT_WRITER_STORAGE_KEY, id);
      }
      state.accountStateWriterId = id;
    } catch (_) {}
  }
  state.accountStateWriterId ||= unique();
  return state.accountStateWriterId;
}

function accountStateWriterFileName() {
  return `${ACCOUNT_STATE_WRITER_PREFIX}${getAccountStateWriterId()}.json`;
}

function accountStateError(code, status = 409) {
  return Object.assign(new Error('기록 동기화를 확인하지 못했습니다. 기존 기록은 보존됩니다.'), { code, status });
}

async function readAccountStateJson(url, options = {}) {
  if (String(options.method || 'GET').toUpperCase() !== 'GET') throw accountStateError('account_state_read_method');
  const controller = new AbortController(), parent = options.signal;
  const generation = state.authGeneration, dataGeneration = state.driveSessionGeneration;
  const account = state.authAccountKey, accountId = state.accountId;
  let response = null, timer = null, rejectCancelled;
  const assertOwner = () => {
    assertDriveRequestOwner(generation, parent, dataGeneration);
    if (account !== state.authAccountKey || accountId !== state.accountId) {
      throw new DOMException('Account state read owner changed', 'AbortError');
    }
    controller.signal.throwIfAborted();
  };
  const cancelBody = () => { try { void response?.body?.cancel()?.catch(() => {}); } catch (_) {} };
  const cancel = error => { controller.abort(error); cancelBody(); rejectCancelled(error); };
  const onAbort = () => cancel(new DOMException('Account state read cancelled', 'AbortError'));
  const cancelled = new Promise((_, reject) => { rejectCancelled = reject; });
  parent?.addEventListener('abort', onAbort, { once: true });
  try {
    assertOwner();
    timer = setTimeout(() => {
      let error;
      try { assertOwner(); } catch (changed) { error = changed; }
      cancel(error || Object.assign(accountStateError('account_state_read_timeout', 408), { name: 'TimeoutError' }));
    }, ACCOUNT_STATE_READ_TIMEOUT_MS);
    const operation = (async () => {
      const result = await driveFetch(url, { ...options, signal: controller.signal,
        [ACCOUNT_STATE_READ]: true, [ACCOUNT_STATE_READ_RESPONSE]: received => {
          response = received;
          if (controller.signal.aborted) cancelBody();
        }
      }, false, 0, generation, dataGeneration);
      assertOwner();
      const value = await result.json();
      assertOwner();
      return value;
    })();
    return await Promise.race([operation, cancelled]);
  } catch (error) {
    controller.abort(error); cancelBody();
    throw error;
  } finally {
    clearTimeout(timer);
    parent?.removeEventListener('abort', onAbort);
    response = null;
  }
}

function validateRawAccountMediaState(value, legacy = false) {
  const record = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const timestamp = v => Number.isSafeInteger(v) && v >= 0;
  if (!record(value) || !record(value.viewed) || !record(value.favorites)) throw accountStateError('malformed_account_state');
  if (value.schemaVersion !== ACCOUNT_STATE_SCHEMA_VERSION
    && !(legacy && !Object.prototype.hasOwnProperty.call(value, 'schemaVersion'))) throw accountStateError('unsupported_account_state');
  if (Object.prototype.hasOwnProperty.call(value, 'updatedAt') && !timestamp(value.updatedAt)) throw accountStateError('malformed_account_state');
  if (Object.entries(value.viewed).some(([id, time]) => !id || !timestamp(time) || time === 0)
    || Object.entries(value.favorites).some(([id, entry]) => !id || (typeof entry !== 'boolean'
      && (!record(entry) || typeof entry.liked !== 'boolean' || !timestamp(entry.updatedAt))))) throw accountStateError('malformed_account_state');
  return value;
}

function isAccountStateWriteRequest(address, method, scope) {
  if (!ACCOUNT_STATE_WRITES_ENABLED || !scope || state.demo || !state.accountId || !state.accountStateLoaded || state.accountIdentityPending
    || scope.accountId !== state.accountId || scope.writerId !== getAccountStateWriterId()) return false;
  let url;
  try { url = new URL(address); } catch (_) { return false; }
  if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.hash
    || url.searchParams.get('fields') !== 'id,modifiedTime'
    || [...url.searchParams.keys()].sort().join(',') !== 'fields,uploadType') return false;
  if (method === 'POST') return scope.kind === 'create'
    && typeof scope.fileId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(scope.fileId)
    && url.pathname === '/upload/drive/v3/files' && url.searchParams.get('uploadType') === 'multipart';
  return method === 'PATCH' && scope.kind === 'update' && scope.fileId === state.accountStateFileId
    && url.pathname === `/upload/drive/v3/files/${encodeURIComponent(scope.fileId)}`
    && url.searchParams.get('uploadType') === 'media';
}

async function reserveAccountStateFileId(options) {
  const accountId = state.accountId;
  const writerId = getAccountStateWriterId();
  if (!accountId || state.accountIdentityPending) throw accountStateError('account_state_owner_missing');
  const key = `drive-original.account-state-file.${accountId}.${writerId}`;
  const stored = localStorage.getItem(key);
  const valid = entry => entry?.schemaVersion === 1 && entry.accountId === accountId && entry.writerId === writerId
    && typeof entry.fileId === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(entry.fileId);
  if (stored) {
    let entry;
    try { entry = JSON.parse(stored); } catch (_) { throw accountStateError('invalid_account_state_reservation'); }
    if (!valid(entry)) throw accountStateError('invalid_account_state_reservation');
    return entry.fileId;
  }
  const data = await readAccountStateJson(`${DRIVE_API}/files/generateIds?count=1&space=appDataFolder&type=files`, options);
  const entry = { schemaVersion: 1, accountId, writerId, fileId: data?.ids?.length === 1 ? data.ids[0] : null };
  if (!valid(entry) || data.space !== 'appDataFolder' || state.accountId !== accountId
    || state.accountIdentityPending || getAccountStateWriterId() !== writerId) throw accountStateError('invalid_account_state_reservation');
  const text = JSON.stringify(entry);
  // A stable server-generated ID makes response-loss retries refer to one file,
  // including after a reload or delayed catalog visibility. Never POST if the
  // reservation cannot be durably retained and reread for this account/writer.
  localStorage.setItem(key, text);
  if (localStorage.getItem(key) !== text) throw accountStateError('account_state_reservation_not_saved');
  return entry.fileId;
}

async function confirmAccountStateWrite(fileId, expected, options) {
  const params = new URLSearchParams({ fields: 'id,name,modifiedTime,trashed,spaces' });
  const metadata = await readAccountStateJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params}`, options);
  if (metadata?.id !== fileId || metadata.name !== accountStateWriterFileName() || metadata.trashed !== false
    || !Array.isArray(metadata.spaces) || !metadata.spaces.includes('appDataFolder')) throw accountStateError('account_state_readback_owner');
  const confirmed = await readAccountStateFile(fileId, options);
  if (!accountMediaStatesEqual(mergeAccountMediaStates(expected, confirmed), confirmed)) {
    throw accountStateError('account_state_readback_unconfirmed', 503);
  }
  return { id: fileId, modifiedTime: metadata.modifiedTime };
}

function captureAccountStateRequest() {
  const generation = state.authGeneration;
  const dataGeneration = state.driveSessionGeneration;
  if (!state.accountStateAbortController || state.accountStateAbortController.signal.aborted) {
    state.accountStateAbortController = new AbortController();
  }
  const signal = state.accountStateAbortController.signal;
  return {
    options: { signal },
    assert() { assertDriveRequestOwner(generation, signal, dataGeneration); },
    current() { return !signal.aborted && generation === state.authGeneration && dataGeneration === state.driveSessionGeneration; }
  };
}

function accountMediaStatesEqual(first, second) {
  const a = normalizeAccountMediaState(first);
  const b = normalizeAccountMediaState(second);
  return a.updatedAt === b.updatedAt
    && Object.keys(a.viewed).length === Object.keys(b.viewed).length
    && Object.keys(a.favorites).length === Object.keys(b.favorites).length
    && Object.keys(a.viewed).every((id) => a.viewed[id] === b.viewed[id])
    && Object.keys(a.favorites).every((id) => a.favorites[id].liked === b.favorites[id]?.liked
      && a.favorites[id].updatedAt === b.favorites[id]?.updatedAt);
}

function applyMergedAccountMediaState(merged) {
  const before = accountFavoriteIds(state.accountMediaState);
  const after = accountFavoriteIds(merged);
  state.accountMediaState = merged;
  if (before.size !== after.size || [...before].some((id) => !after.has(id))) {
    // A back snapshot must not revive obsolete favorite membership.
    invalidateLibraryNavigationData();
  }
}

function canRefreshAccountState() {
  return !state.demo && Boolean(state.accountId) && !state.accountIdentityPending
    && hasUsableToken() && hasAuthCapability('appData') && navigator.onLine !== false && document.visibilityState === 'visible';
}

function stopAccountStateRefresh() {
  clearTimeout(state.accountStateRefreshTimer);
  state.accountStateRefreshTimer = null;
}

function scheduleAccountStateRefresh(delay = ACCOUNT_STATE_REFRESH_INTERVAL_MS) {
  stopAccountStateRefresh();
  if (!canRefreshAccountState() || state.accountStateRefreshBlocked) return;
  const owner = captureAccountStateRequest();
  const wait = Math.max(delay, state.accountStateRefreshNotBefore - Date.now(), 0);
  const timer = setTimeout(async () => {
    if (state.accountStateRefreshTimer !== timer) return;
    state.accountStateRefreshTimer = null;
    if (!owner.current() || !canRefreshAccountState()) return;
    if (state.accountStateLoadingPromise || state.accountStateSyncPromise) {
      scheduleAccountStateRefresh();
      return;
    }
    try {
      await initializeAccountMediaState({ refresh: true });
      if (owner.current() && canRefreshAccountState()) await refreshSyncedFavoriteFiles();
    } catch (_) {
      // Initialization owns the error/status and server-directed backoff.
    } finally {
      if (owner.current()) scheduleAccountStateRefresh();
    }
  }, Math.min(wait, 2_147_483_647));
  state.accountStateRefreshTimer = timer;
  timer?.unref?.();
}

function refreshSyncedFavoriteFiles() {
  if (state.filter !== 'favorites' || state.loadingFavorites || state.bulkAction
    || libraryNavigation.restoring || edgeBackGesture || libraryNavigation.animations.length) return;
  const desired = accountFavoriteIds(state.accountMediaState);
  if (desired.size === state.favoriteFiles.length && state.favoriteFiles.every((file) => desired.has(file.id))) return;
  return loadFavoriteFiles({ refreshState: false, preserveWindow: true });
}

async function resolveDriveAccountId(options = {}) {
  const data = await readAccountStateJson(`${DRIVE_API}/about?fields=user(permissionId)`, options);
  return String(data?.user?.permissionId || '');
}

async function findAccountStateFile(options = {}) {
  const result = await collectAllPages(async (pageToken) => {
    const params = new URLSearchParams({
      spaces: 'appDataFolder',
      pageSize: '1000',
      orderBy: 'modifiedTime desc',
      q: `(name = '${ACCOUNT_STATE_FILE_NAME}' or name contains '${ACCOUNT_STATE_WRITER_PREFIX}') and trashed = false`,
      fields: 'nextPageToken,incompleteSearch,files(id,name,modifiedTime)'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await readAccountStateJson(`${DRIVE_API}/files?${params.toString()}`, options);
    if (!page || !Array.isArray(page.files)
      || (page.nextPageToken != null && typeof page.nextPageToken !== 'string')
      || page.files.some(file => typeof file?.name !== 'string' || typeof file?.id !== 'string')) {
      throw accountStateError('malformed_account_state_catalog');
    }
    if (page.incompleteSearch === true) throw accountStateError('account_state_catalog_incomplete');
    return page;
  }, options);
  const files = result.items.filter((file) => file?.name === ACCOUNT_STATE_FILE_NAME
    || String(file?.name || '').startsWith(ACCOUNT_STATE_WRITER_PREFIX));
  if (files.some(file => typeof file.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(file.id)
    || (file.name !== ACCOUNT_STATE_FILE_NAME && !/^drive-original-account-state-v2-[A-Za-z0-9_-]+\.json$/.test(file.name)))) {
    throw accountStateError('malformed_account_state_catalog');
  }
  const ownFile = files.find((file) => file.name === accountStateWriterFileName());
  if (new Set(files.map(file => file.id)).size !== files.length
    || new Set(files.map(file => file.name)).size !== files.length) throw accountStateError('account_state_duplicate_writer');
  return { id: ownFile?.id || null, files };
}

async function readAccountStateFile(fileId, options = {}, legacy = false) {
  if (!fileId) return createEmptyAccountMediaState();
  const data = await readAccountStateJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, options);
  return normalizeAccountMediaState(validateRawAccountMediaState(data, legacy));
}

async function readRemoteAccountMediaState(catalog, options = {}) {
  const files = Array.isArray(catalog?.files) ? catalog.files : (catalog?.id ? [catalog] : []);
  const cache = state.accountStateReadCache;
  const results = await runTaskPool(files, async (file) => {
    if (options.signal?.aborted) throw new DOMException('Account request aborted', 'AbortError');
    const cached = cache.get(file.id);
    if (file.modifiedTime && cached?.modifiedTime === file.modifiedTime) return cached.data;
    try {
      const data = await readAccountStateFile(file.id, options, file.name === ACCOUNT_STATE_FILE_NAME);
      if (options.signal?.aborted) throw new DOMException('Account request aborted', 'AbortError');
      cache.set(file.id, { modifiedTime: file.modifiedTime, data });
      return data;
    } catch (error) {
      if (error?.status === 404) cache.delete(file.id);
      throw error;
    }
  }, 4);
  const failure = results.find((entry) => entry.status === 'rejected');
  if (failure) throw failure.reason;
  return results.reduce((merged, entry) => mergeAccountMediaStates(merged, entry.value), createEmptyAccountMediaState());
}

async function createAccountStateFile(accountState, options = {}) {
  if (!ACCOUNT_STATE_WRITES_ENABLED) throw accountStateError('candidate_read_only', 423);
  const fileId = await reserveAccountStateFileId(options);
  const boundary = `drive_original_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const metadata = JSON.stringify({ id: fileId, name: accountStateWriterFileName(), mimeType: 'application/json', parents: ['appDataFolder'] });
  const expected = normalizeAccountMediaState(accountState);
  const payload = JSON.stringify(expected);
  const body = [
    `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
    `--${boundary}`, 'Content-Type: application/json', '', payload, `--${boundary}--`, ''
  ].join('\r\n');
  let failure = null;
  try {
    const response = await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime', {
      ...options, driveNoRetry: true, method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
      [ACCOUNT_STATE_WRITE]: { kind: 'create', accountId: state.accountId, writerId: getAccountStateWriterId(), fileId }
    });
    await response.body?.cancel();
  } catch (error) { failure = error; }
  try { return await confirmAccountStateWrite(fileId, expected, options); }
  catch (error) { throw failure || error; }
}

async function updateAccountStateFile(fileId, accountState, options = {}) {
  if (!ACCOUNT_STATE_WRITES_ENABLED) throw accountStateError('candidate_read_only', 423);
  const expected = normalizeAccountMediaState(accountState);
  let failure = null;
  try {
    const response = await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(fileId)}?uploadType=media&fields=id,modifiedTime`, {
      ...options, driveNoRetry: true, method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(expected),
      [ACCOUNT_STATE_WRITE]: { kind: 'update', accountId: state.accountId, writerId: getAccountStateWriterId(), fileId }
    });
    await response.body?.cancel();
  } catch (error) { failure = error; }
  try { return await confirmAccountStateWrite(fileId, expected, options); }
  catch (error) { throw failure || error; }
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
  const owner = captureAccountStateRequest();
  const operation = (async () => {
    const accountId = await resolveDriveAccountId(owner.options);
    owner.assert();
    if (!accountId) throw new Error('Google Drive 계정 식별 정보를 확인하지 못했습니다.');
    const previousId = state.previousAccountId || state.accountId;
    if (previousId && previousId !== accountId) {
      // Preserve an expired-session resume only after identity matches. A real
      // account change must not reuse another account's file IDs or navigation.
      if (el.playerSheet && !el.playerSheet.hidden) closePlayer();
      state.selected = null;
      state.authRetryContext = null;
      state.retryAfterAuth = false;
      state.files = [];
      state.folders = [];
      state.folderStack = [];
      state.currentFolderId = 'root';
      state.currentFolderName = '내 드라이브';
      state.deepScan = false;
      state.treeCache = null;
      state.rootFolderId = null;
      state.favoriteFiles = [];
    }
    state.previousAccountId = null;
    state.accountIdentityPending = false;
    if (state.accountId !== accountId) {
      state.accountId = accountId;
      state.accountStateFileId = null;
      state.accountStateReadCache.clear();
      state.accountMediaState = createEmptyAccountMediaState();
      state.accountMediaState = readCachedAccountMediaState(accountId);
    }
    if (!hasAuthCapability('appData')) {
      state.accountStateSyncError = missingScopeError('appData');
      state.accountStateRefreshBlocked = true;
      refreshFavoritePresentation();
      updateAccountSyncStatus();
      return state.accountMediaState;
    }
    const catalog = await findAccountStateFile(owner.options);
    owner.assert();
    state.accountStateFileId = catalog?.id || null;
    const remote = await readRemoteAccountMediaState(catalog, owner.options);
    owner.assert();
    const merged = mergeAccountMediaStates(remote, state.accountMediaState);
    const remoteNeedsMerge = !accountMediaStatesEqual(merged, remote);
    applyMergedAccountMediaState(merged);
    state.accountStateLoaded = true;
    state.accountStateLastSyncAt = Date.now();
    state.accountStateSyncError = null;
    state.accountStateRefreshFailures = 0;
    state.accountStateRefreshNotBefore = 0;
    state.accountStateRefreshBlocked = false;
    persistAccountMediaState();
    if (state.accountLocalStorageError) throw accountStateError('account_state_cache_not_saved');
    refreshFavoritePresentation();
    updateAccountSyncStatus();
    // Recovery only reads the origin account's submitted operations. It never
    // replays a PATCH, including after a reload or a changed credential.
    void recoverDriveMutations().catch(() => {});
    if (remoteNeedsMerge) queueAccountStateSync();
    return state.accountMediaState;
  })();
  state.accountStateLoadingPromise = operation;
  try { return await operation; }
  catch (error) {
    if (owner.current() && error?.name !== 'AbortError') {
      state.accountStateSyncError = error;
      const status = Number(error?.status) || 0;
      const rateLimited = status === 429 || [error?.driveReason, ...(Array.isArray(error?.reasons) ? error.reasons : [])]
        .some((reason) => /rateLimitExceeded/i.test(String(reason || '')));
      state.accountStateRefreshBlocked = status >= 400 && status < 500 && status !== 408 && !rateLimited;
      state.accountStateRefreshFailures = Math.min(4, state.accountStateRefreshFailures + 1);
      state.accountStateRefreshNotBefore = Date.now() + Math.max(Number(error?.retryAfterMs) || 0,
        ACCOUNT_STATE_REFRESH_INTERVAL_MS * (2 ** (state.accountStateRefreshFailures - 1)));
      updateAccountSyncStatus();
    }
    throw error;
  } finally {
    if (state.accountStateLoadingPromise === operation) state.accountStateLoadingPromise = null;
    if (owner.current()) scheduleAccountStateRefresh();
  }
}

async function flushAccountMediaState() {
  if (state.demo || !hasUsableToken() || !hasAuthCapability('appData') || !state.accountId || !state.accountStateLoaded || state.accountIdentityPending) return;
  if (state.accountStateSyncPromise) return state.accountStateSyncPromise;
  const revisionAtStart = state.accountStateRevision;
  const accountId = state.accountId;
  const owner = captureAccountStateRequest();
  const synchronize = async () => {
    owner.assert();
    const catalog = await findAccountStateFile(owner.options);
    owner.assert();
    const fileId = catalog?.id || null;
    state.accountStateFileId = fileId;
    const remote = await readRemoteAccountMediaState(catalog, owner.options);
    owner.assert();
    // Read local changes inside the writer lock. Devices never PATCH each
    // other's files; the legacy document is a read-only migration input.
    persistAccountMediaState();
    if (state.accountLocalStorageError) throw accountStateError('account_state_cache_not_saved');
    let merged = mergeAccountMediaStates(remote, state.accountMediaState);
    applyMergedAccountMediaState(merged);
    persistAccountMediaState();
    if (state.accountLocalStorageError) throw accountStateError('account_state_cache_not_saved');
    if (fileId) {
      try { await updateAccountStateFile(fileId, merged, owner.options); }
      catch (error) {
        if (error?.status !== 404) throw error;
        owner.assert();
        const fresh = await findAccountStateFile(owner.options);
        owner.assert();
        if (fresh.id) throw error;
        const freshRemote = await readRemoteAccountMediaState(fresh, owner.options);
        owner.assert();
        merged = mergeAccountMediaStates(freshRemote, state.accountMediaState);
        applyMergedAccountMediaState(merged);
        persistAccountMediaState();
        if (state.accountLocalStorageError) throw accountStateError('account_state_cache_not_saved');
        const created = await createAccountStateFile(merged, owner.options);
        owner.assert();
        state.accountStateFileId = created?.id || null;
      }
      state.accountStateReadCache.delete(fileId);
    } else {
      const created = await createAccountStateFile(merged, owner.options);
      owner.assert();
      state.accountStateFileId = created?.id || null;
    }
    owner.assert();
    state.accountStateLastSyncAt = Date.now();
    state.accountStateSyncError = null;
    state.accountStateSyncRetryCount = 0;
    clearTimeout(state.accountStateSyncRetryTimer);
    state.accountStateSyncRetryTimer = null;
    refreshFavoritePresentation();
  };
  const operation = navigator.locks?.request
    ? navigator.locks.request(`drive-original:account:${accountId}:${getAccountStateWriterId()}`, owner.options, synchronize)
    : synchronize();
  state.accountStateSyncPromise = operation;
  updateAccountSyncStatus();
  try { await operation; }
  catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    state.accountStateSyncError = error;
    reportAppFailure('account-state-sync', error, 'warn');
    scheduleAccountStateSyncRetry(error);
  } finally {
    if (state.accountStateSyncPromise === operation) state.accountStateSyncPromise = null;
    if (owner.current()) {
      if (state.accountStateRevision !== revisionAtStart) queueAccountStateSync();
      updateAccountSyncStatus();
    }
  }
}

function scheduleAccountStateSyncRetry(error) {
  const status = Number(error?.status) || 0;
  const retryable = !navigator.onLine || status === 0 || status === 408 || status === 429 || status >= 500;
  if (!hasAuthCapability('appData') || !retryable || state.accountStateSyncRetryCount >= 3 || !state.accountId) return;
  state.accountStateSyncRetryCount += 1;
  const delay = Math.max(Number(error?.retryAfterMs) || 0, 1_000 * (2 ** (state.accountStateSyncRetryCount - 1)));
  clearTimeout(state.accountStateSyncRetryTimer);
  state.accountStateSyncRetryTimer = setTimeout(() => {
    state.accountStateSyncRetryTimer = null;
    flushAccountMediaState();
  }, Math.min(delay, MAX_ORIGINAL_RETRY_AFTER_MS));
}

function queueAccountStateSync() {
  persistAccountMediaState();
  if (state.demo || !state.accountId) return;
  if (!hasAuthCapability('appData')) {
    state.accountStateSyncError = missingScopeError('appData');
    updateAccountSyncStatus();
    return;
  }
  clearTimeout(state.accountStateSyncRetryTimer);
  state.accountStateSyncRetryTimer = null;
  clearTimeout(state.accountStateSyncTimer);
  state.accountStateSyncTimer = setTimeout(() => {
    state.accountStateSyncTimer = null;
    flushAccountMediaState();
  }, ACCOUNT_STATE_SYNC_DELAY_MS);
  updateAccountSyncStatus();
}

function updateAccountSyncStatus() {
  if (!el.accountSyncStatus) return;
  const pending = state.accountStateSyncPromise || state.accountStateSyncTimer;
  const waiting = state.accountLocalStorageError || state.accountStateSyncError || !navigator.onLine;
  el.accountSyncStatus.hidden = state.demo || !state.accountId || !waiting;
  el.accountSyncStatus.dataset.state = waiting ? 'pending' : pending ? 'syncing' : 'synced';
  el.accountSyncStatus.textContent = waiting ? (state.accountLocalStorageError
    ? '기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요.'
    : state.accountStateSyncError?.code === 'insufficient_scope'
      ? '기록은 이 기기에 보관 중 · 동기화하려면 다시 연결해 주세요.'
      : '기록 동기화 대기 · 연결을 확인해 주세요.')
    : '';
}

let mediaViewObservation = null;

function beginMediaViewObservation({ previousSession = null } = {}) {
  const prior = mediaViewObservation;
  const recorded = previousSession != null && prior?.session === previousSession
    && prior?.fileId === state.selected?.id && prior?.account === state.accountId
    && prior?.accountGeneration === state.driveSessionGeneration && prior.recorded;
  mediaViewObservation = state.selected ? {
    fileId: state.selected.id, session: state.mediaSession,
    account: state.accountId, accountGeneration: state.driveSessionGeneration,
    sourceGeneration: mediaSourceGeneration, seekGeneration: mediaSeekGeneration,
    firstMediaTime: null, recorded: Boolean(recorded)
  } : null;
}

function isCurrentMediaViewObservation(owner, element) {
  return Boolean(owner && owner === mediaViewObservation && !owner.recorded
    && owner.fileId === state.selected?.id && owner.session === state.mediaSession
    && owner.account === state.accountId && owner.accountGeneration === state.driveSessionGeneration
    && (!state.accountIdentityPending || state.demo)
    && document.visibilityState === 'visible' && !el.playerSheet?.hidden
    && el.mediaError?.hidden !== false && element && !element.hidden && isCurrentMediaEvent(element));
}

function commitMediaViewObservation(owner) {
  owner.recorded = true;
  markFileViewed(owner.fileId);
}

function noteViewedVideoPresentation(video, mediaTime, confidence) {
  const owner = mediaViewObservation;
  if (!isCurrentMediaViewObservation(owner, video)) return;
  if (video.paused || video.seeking || state.isSeeking || video.readyState < 2) {
    owner.firstMediaTime = null;
    return;
  }
  if (!['decoded-frame', 'playback-clock'].includes(confidence) || !Number.isFinite(mediaTime)) return;
  if (owner.sourceGeneration !== mediaSourceGeneration || owner.seekGeneration !== mediaSeekGeneration) {
    owner.sourceGeneration = mediaSourceGeneration;
    owner.seekGeneration = mediaSeekGeneration;
    owner.firstMediaTime = null;
  }
  // Viewed means displayed and started, not completed. A paused/seeked first
  // frame alone must not consume the unseen-first random population.
  if (owner.firstMediaTime == null || mediaTime < owner.firstMediaTime) owner.firstMediaTime = mediaTime;
  else if (mediaTime > owner.firstMediaTime + 0.0001) commitMediaViewObservation(owner);
}

function scheduleImageViewedPresentation(image) {
  const owner = mediaViewObservation;
  if (!isCurrentMediaViewObservation(owner, image)) return;
  const source = image.src;
  const sourceGeneration = mediaSourceGeneration;
  const decoded = typeof image.decode === 'function' ? image.decode() : Promise.resolve();
  Promise.resolve(decoded).then(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (isCurrentMediaViewObservation(owner, image)
        && mediaSourceGeneration === sourceGeneration && image.src === source
        && image.complete && image.naturalWidth > 0 && image.naturalHeight > 0) commitMediaViewObservation(owner);
    }));
  }).catch(() => {}); // The owned load/error path reports decoding failures.
}

function resumeMediaViewObservation() {
  if (el.imageViewer?.complete) scheduleImageViewedPresentation(el.imageViewer);
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
  if (!fileId || (state.accountIdentityPending && !state.demo)) return;
  const now = Date.now();
  const current = Number(state.accountMediaState.viewed?.[fileId]) || 0;
  if (current >= now) return;
  state.accountMediaState.viewed[fileId] = now;
  state.accountMediaState.updatedAt = now;
  state.accountStateRevision += 1;
  queueAccountStateSync();
}

function setFavoriteFile(fileId, liked) {
  if (!fileId || (state.accountIdentityPending && !state.demo)) return false;
  const nextLiked = Boolean(liked);
  const current = state.accountMediaState.favorites?.[fileId];
  if (current?.liked === nextLiked) return nextLiked;
  const now = Math.max(Date.now(), normalizeStateTimestamp(current?.updatedAt) + 1);
  state.accountMediaState.favorites[fileId] = { liked: nextLiked, updatedAt: now };
  state.accountMediaState.updatedAt = Math.max(state.accountMediaState.updatedAt, now);
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
    // Viewing history is monotonic. Keeping it makes a restored/trash item
    // remain watched instead of resurrecting contradictory records on merge.
    const timestamp = Math.max(now, normalizeStateTimestamp(state.accountMediaState.favorites[id]?.updatedAt) + 1);
    state.accountMediaState.favorites[id] = { liked: false, updatedAt: timestamp };
    state.accountMediaState.updatedAt = Math.max(state.accountMediaState.updatedAt, timestamp);
  });
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
  const text = feedback.querySelector('.favorite-feedback-label');
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

function tryQuietTokenRefresh() {
  return requestSessionCredential({ background: true, force: true });
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
  if (el.fileGrid) el.fileGrid.setAttribute('aria-busy', String(loadingFavoriteView));
  el.emptyState.hidden = loadingFavoriteView || files.length + visibleFolders.length > 0;
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

/* 무한 스크롤로 아직 불러오지 않은 페이지가 있을 때 전부 로드한다.
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

function filteredAndSortedFiles() {
  const source = sortedPopulationFiles();
  if (filteredPopulationCache?.source === source && filteredPopulationCache.query === state.query
    && filteredPopulationCache.filter === state.filter) return filteredPopulationCache.files;
  const files = source.filter((file) => {
    const isVideo = file.mimeType?.startsWith('video/');
    const typeMatch = state.filter === 'all' || state.filter === 'favorites'
      || (state.filter === 'video' && isVideo) || (state.filter === 'image' && !isVideo);
    const queryMatch = !state.query || String(file.name || '').toLocaleLowerCase('ko').includes(state.query);
    return typeMatch && queryMatch;
  });
  filteredPopulationCache = { source, query: state.query, filter: state.filter, files };
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

  return remember(files.sort((a, b) => {
    if (state.sort === 'name') return FILE_NAME_COLLATOR.compare(String(a.name), String(b.name));
    if (state.sort === 'size') return Number(b.size || 0) - Number(a.size || 0);
    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
  }));
}

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
  if (!state.selectionMode || state.bulkAction) return;
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
    if (event.isPrimary === false || event.button !== 0 || state.bulkAction || isReservedBackStart(event.clientX)) return;
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
      if (!connected || state.bulkAction || (el.playerSheet && !el.playerSheet.hidden)) return;
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
    if (!state.selectionMode && !state.bulkAction) enterSelectionMode(file);
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
  if (playerHistoryPending) return;
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
    if (el.playerMoreMenu) el.playerMoreMenu.open = false;
    isPlayerMoreOpen = false;
    isSpeedMenuOpen = false;
    if (el.speedDropdown) el.speedDropdown.hidden = true;
    el.ctrlSpeedButton?.setAttribute('aria-expanded', 'false');
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
  el.mediaStage.setAttribute('aria-label', '미디어 화면. Tab: 재생 제어, Space: 재생 또는 일시정지, Escape: 닫기');
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
    const revealOnly = el.playerControlsEntry?.contains(event.target)
      || (el.playerModal.classList.contains('controls-idle') && isPlayerBottomActivation(event.clientX,event.clientY));
    if (event.isPrimary !== false && (event.button == null || event.button === 0)
      && (revealOnly || playerChrome.contains(event.target))) {
      playerRevealPointer = {pointerId:event.pointerId,session:state.playbackSession,revealOnly};
    } else playerRevealPointer = null;
    if (revealOnly) {
      clearTimeout(singleTapTimer); singleTapTimer = null; lastTapTime = 0;
      revealPlayerChrome({touch:event.pointerType !== 'mouse'});
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
      .filter(node => !node.disabled && node.getClientRects().length && !node.closest('[hidden]'));
    if (!controls.length) return;
    const index = controls.indexOf(document.activeElement);
    if (recovering) {
      event.preventDefault();
      const next = index < 0 ? (event.shiftKey ? controls.length - 1 : 0)
        : (index + (event.shiftKey ? -1 : 1) + controls.length) % controls.length;
      controls[next].focus({ preventScroll: true });
      return;
    }
    if (index < 0 || (!event.shiftKey && index === controls.length-1) || (event.shiftKey && index === 0)) {
      event.preventDefault();
      controls[event.shiftKey ? controls.length-1 : 0].focus({preventScroll:true});
    }
  }, true);
  window.addEventListener('blur', () => { playerChromePointer=false; playerRevealPointer=null; playerRevealClick=null; cancelActiveTouchGesture(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { playerChromePointer=false; playerRevealPointer=null; playerRevealClick=null; cancelActiveTouchGesture(); setPlayerChromeVisible(false); }
  });
  setPlayerChromeVisible(false);
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
    el.stageCenterPlayBtn.hidden = true;
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
  const duration = playerTimeline().duration || Infinity;
  const target = Math.max(0, Math.min(duration, playerTimeline().currentTime + deltaSeconds));
  setPlayerCurrentTime(el.videoPlayer, target, 'relative');
  showPlayerFeedback(deltaSeconds > 0 ? `+${deltaSeconds}S` : `${deltaSeconds}S`);
  updateVideoProgress();
  resetControlsTimer();
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

async function openPlayerTracks() {
  if (!state.selected || el.videoPlayer.hidden || el.playerSheet.hidden) return;
  if (el.playerMoreMenu) el.playerMoreMenu.open = false;
  collapseShortsExpand();
  el.playerTracksDialog.showModal();
  if (playerTracksOwner?.current()) return;
  el.playerAudioTrack.replaceChildren(new Option('현재 원본 음성', ''));
  el.playerSubtitleTrack.replaceChildren(new Option('끔', ''));
  el.playerAudioTrack.disabled = el.playerSubtitleTrack.disabled = true;
  el.playerTracksStatus.textContent = '음성·자막 목록을 확인하는 중입니다.';
  const file = state.selected, session = state.mediaSession, account = state.authAccountKey;
  const accountGeneration = state.driveSessionGeneration, swController = navigator.serviceWorker?.controller;
  const controller = new AbortController();
  const activeAudio = q1Playback?.fileId === file.id && q1Playback.session === session
    && q1Playback.account === account && q1Playback.accountGeneration === accountGeneration
    && q1Playback.swController === swController && q1Playback.swGeneration === mediaSourceGeneration
    && !q1Playback.controller.signal.aborted ? q1Playback : null;
  const owner = {file, session, account, accountGeneration, controller, source: null,
    subtitles: null, presentation: null, cleanupOk: true,
    identity: activeAudio?.routeIdentity ? {...activeAudio.routeIdentity} : null,
    selectedAudioTrackId: activeAudio?.selectedAudioTrackId,
    nativeColorObservation: activeAudio?.nativeColorObservation || null};
  owner.current = () => playerTracksOwner === owner && !controller.signal.aborted
    && state.selected?.id === file.id && state.mediaSession === session
    && state.authAccountKey === account && state.driveSessionGeneration === accountGeneration
    && navigator.serviceWorker?.controller === swController && !el.playerSheet.hidden;
  playerTracksOwner = owner;
  const readIdentity = async () => {
    const {openDriveQ1Source} = await import('./media/drive-source.mjs');
    if (!owner.current()) throw new Error('Q1_SOURCE_STALE');
    const metadataUrl = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
    metadataUrl.searchParams.set('fields', 'id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');
    metadataUrl.searchParams.set('supportsAllDrives', 'true');
    const source = await openDriveQ1Source({fileId: file.id, accountKey: account, accountGeneration,
      allowCorsHiddenRange: true,
      signal: controller.signal, isCurrent: owner.current,
      readMetadata: async ({signal}) => {
        const headers = file.resourceKey ? {'X-Goog-Drive-Resource-Keys': `${file.id}/${file.resourceKey}`} : {};
        return (await driveFetch(metadataUrl.href, {signal, headers})).json();
      },
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
      const {probePinnedGeneralTracks} = await import('./media/general-tracks.mjs');
      owner.source = await readIdentity();
      owner.inventory = await probePinnedGeneralTracks(owner.source, {signal: controller.signal, isCurrent: owner.current});
      owner.identity = {...owner.inventory.identity};
      owner.cleanupOk &&= owner.inventory.cleanup?.settled === true;
      owner.source = null;
      if (!owner.current()) return;
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
        el.playerAudioTrack.value = String(owner.selectedAudioTrackId ?? owner.inventory.defaultAudioTrackId);
      }
      el.playerAudioTrack.disabled = !owner.inventory.audioTracks.some(track => track.route !== 'unqualified');
      if (owner.inventory.kind !== 'iso') {
        el.playerTracksStatus.textContent = '이 원본 형식의 음성·자막 선택을 지원하지 않습니다.';
        return;
      }
      const [{createPinnedSubtitleTrack}, {createSubtitlePresentation}] = await Promise.all([
        import('./media/subtitle-track.mjs'), import('./media/subtitle-presentation.mjs')]);
      owner.source = await readIdentity();
      owner.subtitles = await createPinnedSubtitleTrack(owner.source, {signal: controller.signal, isCurrent: owner.current});
      owner.source = null;
      if (!owner.current()) { owner.cleanupOk &&= (await owner.subtitles.dispose()).settled; return; }
      for (const track of owner.subtitles.tracks) {
        const option = new Option(`${track.label || track.language || '자막'} (${track.trackId})${track.supported ? '' : ' · 선택 지원 안 됨'}`, String(track.trackId));
        option.disabled = !track.supported; el.playerSubtitleTrack.append(option);
      }
      el.playerSubtitleTrack.disabled = !owner.subtitles.tracks.some(track => track.supported);
      if (el.playerSubtitleTrack.disabled) {
        owner.cleanupOk &&= (await owner.subtitles.dispose()).settled; owner.subtitles = null;
      } else {
        if (typeof el.videoPlayer.addTextTrack !== 'function' || typeof globalThis.VTTCue !== 'function') {
          owner.cleanupOk &&= (await owner.subtitles.dispose()).settled; owner.subtitles = null;
          el.playerSubtitleTrack.disabled = true;
          el.playerTracksStatus.textContent = '이 브라우저는 선택한 텍스트 자막 표시를 지원하지 않습니다.';
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
      el.playerTracksStatus.textContent = owner.subtitles
        ? '음성은 선택한 언어를 유지합니다. 자막은 텍스트만 표시합니다.' : '선택 가능한 텍스트 자막이 없습니다.';
    } catch (error) {
      if (error?.cleanup?.settled === false) owner.cleanupOk = false;
      if (owner.source) { owner.cleanupOk &&= (await owner.source.abort()).settled; owner.source = null; }
      if (owner.current()) el.playerTracksStatus.textContent = '이 파일의 음성·자막 목록을 안전하게 확인하지 못했습니다.';
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
    const {observeNativeFrameColor} = await import('./media/native-color.mjs');
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

function onVideoProgressUpdate() {
  if (!el.videoPlayer || !el.seekBarBuffered) return;
  const duration = playerTimeline().duration;
  if (!duration || duration <= 0) return;
  const buffered = el.videoPlayer.buffered;
  if (buffered.length > 0) {
    const mapping = playerTimeline().mapping;
    const end = buffered.end(buffered.length - 1) + (mapping ? mapping.commonShift - mapping.sourceOrigin : 0);
    const bufferedRatio = Math.min(1, Math.max(0, end / duration));
    el.seekBarBuffered.style.transform = `scaleX(${bufferedRatio})`;
  }
}

function updateVideoProgress() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const currentTime = playerTimeline().currentTime || 0;
  const duration = Number.isFinite(playerTimeline().duration) ? playerTimeline().duration : 0;
  const ratio = duration > 0 ? Math.min(1, Math.max(0, currentTime / duration)) : 0;

  if (el.seekBarPlayed) el.seekBarPlayed.style.transform = `scaleX(${ratio})`;
  if (el.seekBarThumb && el.seekBarContainer) {
    el.seekBarThumb.style.setProperty('--seek-x', `${ratio * el.seekBarContainer.clientWidth}px`);
  }
  if (el.mobileShortsProgressBar) el.mobileShortsProgressBar.style.transform = `scaleX(${ratio})`;
  if (el.ctrlCurrentTime) el.ctrlCurrentTime.textContent = formatPlayerTime(currentTime);
  if (el.ctrlTotalTime) el.ctrlTotalTime.textContent = formatPlayerTime(duration);
  [el.seekBarContainer, el.mobileShortsProgressTrack].filter(Boolean).forEach((track) => {
    track.setAttribute('aria-valuenow', Math.round(Math.min(currentTime, duration)));
    track.setAttribute('aria-valuemax', Math.round(duration));
    track.setAttribute('aria-valuetext', `${formatPlayerTime(currentTime)} / ${formatPlayerTime(duration)}`);
  });
  onVideoProgressUpdate();
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
  const target = event.target;
  if (isPlayerGestureControl(target)) {
    cancelPendingStageTap();
    return;
  }
  if (isPlayerBottomActivation(event.clientX, event.clientY)) { cancelPendingStageTap(); return; }
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
    reportAppFailure('picture-in-picture', err, 'warn');
  }
}

/* Mobile shorts bottom action chips — ⋯ 버튼 위 세로 스택으로 삭제/이동/PiP/Drive 노출 */
let shortsExpandTimer = null;

function toggleShortsExpand() {
  if (!el.mobileShortsOverlay) return;
  const expanded = el.mobileShortsOverlay.classList.toggle('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', String(expanded));
  clearTimeout(shortsExpandTimer);
  shortsExpandTimer = null;
  // Keep menus available until an explicit dismissal or action. A timer must
  // not make an action disappear while it is being read or keyboard-focused.
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
let touchContactId = null;
let touchSession = null;
let lockedAxis = null;
let lastTapTime = 0;
let lastTapX = 0;
let lastTapY = 0;
let lastTapZone = null;
let singleTapTimer = null;

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
  if (nx >= 0.3 && nx <= 0.7 && ny >= 0.3 && ny <= 0.7) return 'center';
  const edgeX = nx < 0.5 ? nx : 1 - nx;
  const edgeY = ny < 0.5 ? ny : 1 - ny;
  if (edgeX <= edgeY) return nx < 0.5 ? 'left' : 'right';
  return ny < 0.5 ? 'top' : 'bottom';
}

function setStageImmersive(on) {
  if (on) setPlayerChromeVisible(false);
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
  const session = state.mediaSession;
  const dismissChrome = Boolean(el.playerModal && !el.playerModal.classList.contains('controls-idle'));
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
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    // Consume the pair. A third rapid tap starts a new gesture instead of
    // chaining against the second tap and toggling the favorite repeatedly.
    cancelPendingStageTap();
    const rect = el.mediaStage.getBoundingClientRect();
    const doubleTapAction = resolveMediaDoubleTapAction(clientX, rect.left, rect.width, !el.videoPlayer?.hidden, zone);
    // Center likes, lateral edges seek. Top/bottom contacts do neither.
    if (doubleTapAction === 'seek-backward' || doubleTapAction === 'seek-forward') {
      const seekZone = doubleTapAction === 'seek-backward' ? 'left' : 'right';
      seekRelative(seekZone === 'left' ? -10 : 10);
      flashSeekHint(seekZone);
    } else if (doubleTapAction === 'favorite') {
      toggleFavoriteForSelected({ showFeedback: true });
      navigator.vibrate?.(10);
    }
    return;
  }

  // Only the central 2D region owns pause/play. Chrome dismissal remains
  // independent of playback, including when a visible layer covers the stage.
  if (singleTapTimer) clearTimeout(singleTapTimer);
  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    if (session !== state.mediaSession || el.playerSheet?.hidden) return;
    if (dismissChrome) setPlayerChromeVisible(false);
    else if (zone === 'center' && el.videoPlayer && !el.videoPlayer.hidden) togglePlayPause();
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
      return;
    }
    if (e.touches.length === 1 && isPlayerBottomActivation(e.touches[0].clientX, e.touches[0].clientY)) {
      cancelActiveTouchGesture();
      revealPlayerChrome({touch:true});
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
    // A second contact may still become a double tap, but cannot let the first
    // tap timer fire while this contact is being held or dragged.
    clearTimeout(singleTapTimer);
    singleTapTimer = null;
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
    touchContactId = e.touches[0].identifier ?? null;
    touchSession = state.mediaSession;
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
    if (touchSession !== state.mediaSession) { cancelActiveTouchGesture(); return; }
    if (e.cancelable === false) { cancelActiveTouchGesture(); return; }
    if (e.touches.length !== 1 || (touchContactId !== null && e.touches[0].identifier !== touchContactId)) {
      cancelActiveTouchGesture();
      return;
    }
    const rawX = e.touches[0].clientX - touchStartX;
    const rawY = e.touches[0].clientY - touchStartY;
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
    cancelPendingStageTap();
    lockedAxis = null;
    swipeGestureDirection = null;
    swipeGestureTargetId = null;
    swipeGestureAwaitingPopulation = false;
  }, { passive: false });

  modal.addEventListener('touchcancel', cancelActiveTouchGesture, { passive: true });
}

function cancelActiveTouchGesture() {
  cancelPendingStageTap();
  if (!isTouchActive) return;
  isTouchActive = false;
  touchContactId = null;
  touchSession = null;
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
      if (!isNaN(digit) && playerTimeline().duration) {
        event.preventDefault();
        setPlayerCurrentTime(
          el.videoPlayer,
          (digit / 10) * playerTimeline().duration,
          'digit-shortcut'
        );
        showPlayerFeedback(`SEEK ${digit * 10}%`);
        updateVideoProgress();
      }
    }
  }
}

function setNativeVideoActionsAvailable(available) {
  const enabled = Boolean(available);
  if (el.mobileShortsProgressTrack) el.mobileShortsProgressTrack.hidden = !enabled;
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !enabled;
  if (el.shortsPipBtn) el.shortsPipBtn.hidden = !document.pictureInPictureEnabled || !enabled;
  updateFrameStepVisibility(enabled && Boolean(el.videoPlayer?.paused));
  if (el.shortsRotateBtn) el.shortsRotateBtn.hidden = !enabled;
  if (el.ctrlTracks) el.ctrlTracks.hidden = !enabled;
  if (el.shortsTracksBtn) el.shortsTracksBtn.hidden = !enabled;
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
    time: Number.isFinite(playerTimeline(video).currentTime) ? playerTimeline(video).currentTime : 0,
    paused: Boolean(video.paused) && !state.pendingPlay,
    volume: Number.isFinite(video.volume) ? video.volume : 1,
    muted: Boolean(video.muted),
    playbackRate: Number.isFinite(video.playbackRate) ? video.playbackRate : 1,
    fullscreen: Boolean(document.fullscreenElement || document.webkitFullscreenElement),
    decoded: state.mediaDecodeVerified === true,
    ...(q1Playback?.selectedAudioTrackId !== undefined ? {
      selectedAudioTrackId: q1Playback.selectedAudioTrackId,
      audioCompatibility: q1Playback.audioCompatibility,
      audioIdentity: q1Playback.routeIdentity
    } : {})
  };
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
    showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.');
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
    showMediaLoading('원본 형식 확인 중');
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
    showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.');
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
  showMediaLoading(message);
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
    const file = state.selected, metadataUrl = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
    metadataUrl.searchParams.set('fields', 'id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');
    metadataUrl.searchParams.set('supportsAllDrives', 'true');
    source = await openDriveQ1Source({fileId:file.id, accountKey:owner.account,
      accountGeneration:owner.accountGeneration, signal:owner.controller.signal, isCurrent:current,
      readMetadata:async ({signal}) => {
        const headers=file.resourceKey ? {'X-Goog-Drive-Resource-Keys':`${file.id}/${file.resourceKey}`} : {};
        const response=await driveFetch(metadataUrl.href,{signal,headers});
        return response.json();
      },
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
      showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.');
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
    const metadataUrl = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
    metadataUrl.searchParams.set('fields', 'id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');
    metadataUrl.searchParams.set('supportsAllDrives', 'true');
    let routeIdentity = null;
    const openSource = async ({ signal }) => {
      let sourceMetadata;
      const source = await openDriveQ1Source({
      fileId: file.id, accountKey: account, accountGeneration, signal, isCurrent: current,
      readMetadata: async ({ signal }) => {
        const headers = file.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${file.id}/${file.resourceKey}` } : {};
        const response = await driveFetch(metadataUrl.href, { signal, headers });
        sourceMetadata = await response.json();
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
      if (Number.isFinite(snapshot.playbackRate) && snapshot.playbackRate > 0) el.videoPlayer.playbackRate = snapshot.playbackRate;
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
          showMediaLoading(videoCompatibility ? '영상 호환 변환 준비 중' : '원본 스트림 재포장 준비 중'); updateQualityDisplay();
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
                showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.');
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
              if(!retired.settled) {showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.',{showRetry:false});return;}
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
    } else if ([0, 1, 2, 3].includes(mediaErrorCode)) {
      state.mediaAttempt = 'buffer-evaluating';
      await offerOriginalBufferFallback(
        file,
        kind,
        session,
        describeVideoPlaybackFailure(mediaErrorCode),
        sourceGeneration
      );
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
  showMediaLoading(message);
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
    showMediaError('이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.');
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
  showMediaLoading(message);
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
    size: q0PinnedSource && q0PinnedSource.descriptor.fileId === file?.id ? q0PinnedSource.descriptor.size : file?.size,
    mobile: isMobileDevice(),
    opfsAvailable,
    storageAvailable
  });
}

function showOriginalStorageLimit(
  file,
  session,
  reason,
  sourceGeneration = mediaSourceGeneration
) {
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return false;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  state.mediaAttempt = 'buffer-storage-limited';
  state.mediaPlaybackMode = '';
  state.mediaBufferStorageMode = '';
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.pendingOriginalBuffer = null;
  state.lastProxyError = null;
  updateQualityDisplay();
  const explanation = `${reason} 이 기기의 앱 전용 저장공간과 안전한 메모리 한도 안에서 원본을 준비할 수 없습니다. 저장공간을 확보한 뒤 다시 시도하거나 Google 호환 재생을 직접 선택하세요.`;
  if (el.codecNote) {
    el.codecNote.textContent = '기기 저장공간 또는 메모리 한도이며 파일 형식 비호환으로 판정하지 않았습니다.';
  }
  showMediaError(explanation, { title: '기기 저장공간 한도', showRetry: true });
  el.compatPlayerButton.hidden = false;
  return true;
}

async function offerOriginalBufferFallback(
  file,
  kind,
  session,
  reason,
  sourceGeneration = mediaSourceGeneration
) {
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return;
  const policy = await resolveOriginalBufferPolicy(file);
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return;
  if (policy.decision === 'auto') {
    await startOriginalBlobFallback(file, kind, session, {
      confirmed: true,
      policy,
      expectedSourceGeneration: sourceGeneration
    });
    return;
  }
  if (policy.decision === 'denied') {
    showOriginalStorageLimit(
      file,
      session,
      `${reason} 원본 전체 임시 저장도 안전 한도를 넘어`,
      sourceGeneration
    );
    return;
  }
  state.mediaAttempt = 'buffer-choice';
  state.pendingOriginalBuffer = {
    fileId: file.id,
    kind,
    session,
    sourceGeneration,
    reason,
    policy
  };
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
  if (!pending || !isCurrentOriginalBufferOwner(
    state.selected,
    pending.session,
    pending.sourceGeneration
  )) return;
  startOriginalBlobFallback(state.selected, pending.kind, pending.session, {
    confirmed: true,
    policy: pending.policy,
    expectedSourceGeneration: pending.sourceGeneration
  });
}

function confirmPendingMediaAction() {
  const pendingSecurity = state.pendingSecurityConfirmation;
  if (pendingSecurity) {
    if (!isCurrentOriginalBufferOwner(
      state.selected,
      pendingSecurity.session,
      pendingSecurity.sourceGeneration
    )) return;
    state.pendingSecurityConfirmation = null;
    state.mediaAbuseAcknowledged = true;
    el.bufferOriginalButton.textContent = '원본 전체 임시 저장';
    if (pendingSecurity.stage === 'full') {
      state.mediaAttempt = 'buffer-evaluating';
      startOriginalBlobFallback(state.selected, pendingSecurity.kind, pendingSecurity.session, {
        confirmed: true,
        policy: pendingSecurity.policy,
        rangeFallbackOnFailure: pendingSecurity.rangeFallbackOnFailure === true,
        expectedSourceGeneration: pendingSecurity.sourceGeneration
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

async function downloadOriginalFile(
  file,
  session,
  policy,
  signal,
  sourceGeneration = mediaSourceGeneration
) {
  const retired = q1RetirementResult || await q1Retirement;
  if (!retired.settled) throw new Error('Q1_CLEANUP_UNCONFIRMED');
  const headers = {};
  if (file.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${file.id}/${file.resourceKey}`;
  let lastError = null;

  while (state.mediaFullRequestCount < 3) {
    if (signal?.aborted || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    const attempt = state.mediaFullRequestCount;
    state.mediaFullRequestCount += 1;
    let response = null;
    const diagnosticRequestId = beginDirectMediaDiagnosticRequest(session, attempt + 1);
    try {
      response = await fetchOriginalFileResponse(file, { headers, signal, requireRevisionPin: true });
      emitDirectMediaDiagnosticStage(session, diagnosticRequestId, 'headers', {
        status: Number(response.status) || 0,
        totalBytes: Number(response.headers.get('Content-Length')) || 0
      });
      if (signal?.aborted || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        await response.body?.cancel();
        response = null;
        throw createOriginalBufferOwnerError();
      }
      const contentLength = Number(response.headers.get('Content-Length')) || 0;
      const metadataSize = Number(q0PinnedSource?.descriptor.fileId === file.id ? q0PinnedSource.descriptor.size : file.size) || 0;
      if (response.status !== 200) {
        const status = response.status;
        await response.body?.cancel();
        response = null;
        throw new Error(`Unexpected full-original status ${status}`);
      }
      if (metadataSize && contentLength && metadataSize !== contentLength) {
        await response.body?.cancel();
        response = null;
        throw new Error(`Original Content-Length mismatch (${contentLength}/${metadataSize})`);
      }
      if (contentLength && contentLength > policy.hardLimit) {
        await response.body?.cancel();
        response = null;
        throw new RangeError('Original file exceeds the temporary buffer limit');
      }
      const sourceFile = q0PinnedSource?.descriptor.fileId === file.id
        ? { ...file, size: q0PinnedSource.descriptor.size, mimeType: q0PinnedSource.descriptor.mimeType } : file;
      const originalFile = policy.mode === 'disk'
        ? await writeResponseIntoOpfs(
            response,
            sourceFile,
            session,
            policy.hardLimit,
            diagnosticRequestId,
            sourceGeneration
          )
        : await readResponseIntoBlob(
            response,
            sourceFile,
            session,
            policy.hardLimit,
            diagnosticRequestId,
            sourceGeneration
          );
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        cleanupOriginalTempStorage(session, sourceGeneration);
        throw createOriginalBufferOwnerError();
      }
      const expectedSize = metadataSize || contentLength;
      if (expectedSize && originalFile.size !== expectedSize) {
        cleanupOriginalTempStorage(session, sourceGeneration);
        throw new Error(`Original byte count mismatch (${originalFile.size}/${expectedSize})`);
      }
      if (!metadataSize && contentLength) { file.size = String(contentLength); sortedPopulationCache = null; }
      return originalFile;
    } catch (error) {
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        error = createOriginalBufferOwnerError();
      }
      lastError = error;
      emitDirectMediaDiagnosticStage(
        session,
        diagnosticRequestId,
        error?.name === 'AbortError' ? 'request-cancelled' : 'http-error', {
          status: Number(error?.status) || Number(response?.status) || 0,
          reason: error?.name === 'AbortError' ? 'session-cancelled' : 'full-original-failed'
        }, { terminal: true }
      );
      try { if (!response?.body?.locked) await response?.body?.cancel(); } catch (_) {}
      cleanupOriginalTempStorage(session, sourceGeneration);
      const rateLimited = isOriginalTransferRateLimit(error);
      const nonRetryable = error?.name === 'AbortError'
        || error?.name === 'RevisionPinError'
        || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)
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
  {
    confirmed = false,
    policy = null,
    rangeFallbackOnFailure = false,
    expectedSourceGeneration = mediaSourceGeneration
  } = {}
) {
  if (!isCurrentOriginalBufferOwner(file, session, expectedSourceGeneration)) return;
  const resolvedPolicy = policy || await resolveOriginalBufferPolicy(file);
  if (!isCurrentOriginalBufferOwner(file, session, expectedSourceGeneration)) return;
  if (resolvedPolicy.decision === 'denied') {
    showOriginalStorageLimit(
      file,
      session,
      '원본 전체 임시 저장 크기가 이 기기의 안전 한도를 넘어',
      expectedSourceGeneration
    );
    return;
  }
  if (resolvedPolicy.decision === 'confirm' && !confirmed) {
    await offerOriginalBufferFallback(
      file,
      kind,
      session,
      '원본 구간 스트림을 이어가지 못해',
      expectedSourceGeneration
    );
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
  state.mediaTransportStarted = false;
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
  const bufferSourceGeneration = mediaSourceGeneration;

  try {
    const originalFile = await downloadOriginalFile(
      file,
      session,
      resolvedPolicy,
      bufferController.signal,
      bufferSourceGeneration
    );
    if (!isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) {
      cleanupOriginalTempStorage(session, bufferSourceGeneration);
      return;
    }

    state.mediaBlobUrl = URL.createObjectURL(originalFile);
    mediaSourceGeneration += 1;
    state.mediaAttempt = 'blob';
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
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
    if (error.name === 'AbortError'
      || !isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) {
      cleanupOriginalTempStorage(session, bufferSourceGeneration);
      return;
    }
    reportAppFailure('original-buffer-fallback', error);
    cleanupOriginalTempStorage(session, bufferSourceGeneration);
    if (classifyMediaProxyFailure(error) === 'source-pin') {
      await recoverFromMediaProxyError(error);
      return;
    }
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
          policy: memoryPolicy,
          expectedSourceGeneration: bufferSourceGeneration
        });
        return;
      }
      if (memoryPolicy.decision === 'confirm') {
        state.mediaAttempt = 'buffer-choice';
        state.pendingOriginalBuffer = {
          fileId: file.id,
          kind,
          session,
          sourceGeneration: bufferSourceGeneration,
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
      if (memoryPolicy.decision === 'denied') {
        showOriginalStorageLimit(
          file,
          session,
          '앱 전용 임시 디스크 저장을 완료하지 못했고 원본 크기가 안전한 메모리 한도를 넘어',
          bufferSourceGeneration
        );
        return;
      }
    }
    if (isLocalOriginalStorageError(error)
      || (resolvedPolicy.mode === 'memory' && error instanceof RangeError)) {
      showOriginalStorageLimit(
        file,
        session,
        resolvedPolicy.mode === 'disk'
          ? '앱 전용 임시 디스크 저장을 완료하지 못해'
          : '안전한 메모리 원본 준비를 완료하지 못해',
        bufferSourceGeneration
      );
      return;
    }
    if (isDriveSecurityRestriction(error) && !state.mediaAbuseAcknowledged) {
      state.mediaAttempt = 'security-confirmation';
      state.pendingSecurityConfirmation = {
        fileId: file.id,
        session,
        sourceGeneration: bufferSourceGeneration,
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
      clearRejectedToken(error);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (classifyMediaProxyFailure(error) === 'permission') {
      if (state.mediaPermissionRetryCount < 1) {
        state.mediaPermissionRetryCount += 1;
        if (playbackSnapshot) {
          state.resumePosition = { fileId: file.id, time: playbackSnapshot.time, snapshot: playbackSnapshot };
        }
        state.mediaAttempt = 'auth-refresh';
        showMediaLoading('Drive 원본 권한을 다시 확인하는 중');
        const refreshed = await requestSessionCredential({
          background: true,
          force: true,
          rejectedRevision: error.rejectedTokenRevision
        });
        if (!isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) return;
        if (refreshed) {
          state.mediaAttempt = 'buffer-evaluating';
          await startOriginalBlobFallback(file, kind, session, {
            confirmed: true,
            policy: resolvedPolicy,
            rangeFallbackOnFailure,
            expectedSourceGeneration: bufferSourceGeneration
          });
          return;
        }
      }
      // Keep the session: this is a file permission error, not invalid credentials.
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

async function readResponseIntoBlob(
  response,
  file,
  session,
  hardLimit,
  diagnosticRequestId = '',
  sourceGeneration = mediaSourceGeneration
) {
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  if (!response.body?.getReader) {
    throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        throw createOriginalBufferOwnerError();
      }
      if (done) break;
      received += value.byteLength;
      recordDirectMediaDiagnosticBytes(session, diagnosticRequestId, received, total);
      if (received > hardLimit) {
        throw new RangeError('Original file exceeds the memory buffer limit');
      }
      chunks.push(value);
      updateOriginalBufferProgress(received, total, 'memory');
    }
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    completeDirectMediaDiagnosticRequest(session, diagnosticRequestId, received, total);
    return new Blob(chunks, { type: file.mimeType || response.headers.get('Content-Type') || 'application/octet-stream' });
  } catch (error) {
    try { await reader.cancel(error); } catch (_) {}
    throw error;
  } finally {
    reader.releaseLock?.();
  }
}

async function acquireOriginalBufferLease(name) {
  if (!navigator.locks?.request) return () => {};
  let release;
  const lifetime = new Promise((resolve) => { release = resolve; });
  return new Promise((resolve, reject) => {
    navigator.locks.request(`drive-original:media:${name}`, async () => {
      resolve(release);
      await lifetime;
    }).catch(reject);
  });
}

async function writeResponseIntoOpfs(
  response,
  file,
  session,
  hardLimit,
  diagnosticRequestId = '',
  sourceGeneration = mediaSourceGeneration
) {
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
  const name = `media-v2-${session}-${randomPart}.${extension}`;
  const releaseLease = await acquireOriginalBufferLease(name);
  let writable;
  let reader;
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  let received = 0;
  try {
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    const handle = await directory.getFileHandle(name, { create: true });
    if (typeof handle.createWritable !== 'function') {
      throw new DOMException('Writable OPFS is unavailable', 'NotSupportedError');
    }
    writable = await handle.createWritable();
    reader = response.body?.getReader();
    if (!reader) {
      throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
          await reader.cancel();
          throw createOriginalBufferOwnerError();
        }
        if (done) break;
        received += value.byteLength;
        recordDirectMediaDiagnosticBytes(session, diagnosticRequestId, received, total);
        if (received > hardLimit) {
          await reader.cancel();
          throw new RangeError('Original file exceeds temporary storage');
        }
        await writable.write(value);
        if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
          await reader.cancel();
          throw createOriginalBufferOwnerError();
        }
        updateOriginalBufferProgress(received, total, 'disk');
      }
    }
    await writable.close();
    completeDirectMediaDiagnosticRequest(session, diagnosticRequestId, received, total);
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      await directory.removeEntry(name).catch(() => {});
      throw createOriginalBufferOwnerError();
    }
    const storedFile = await handle.getFile();
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      await directory.removeEntry(name).catch(() => {});
      throw createOriginalBufferOwnerError();
    }
    state.mediaTempStorage = { directory, name, session, sourceGeneration, releaseLease };
    return storedFile;
  } catch (error) {
    try {
      if (reader) await reader.cancel(error);
      else await response.body?.cancel(error);
    } catch (_) {}
    try { await writable?.abort(error); } catch (_) {}
    try { await directory.removeEntry(name); } catch (_) {}
    releaseLease();
    throw error;
  } finally {
    reader?.releaseLock?.();
  }
}

function cleanupOriginalTempStorage(session = null, sourceGeneration = null) {
  const temporary = state.mediaTempStorage;
  if (session != null && temporary?.session !== session) return;
  if (sourceGeneration != null && temporary?.sourceGeneration !== sourceGeneration) return;
  state.mediaTempStorage = null;
  if (temporary?.directory && temporary.name) {
    temporary.directory.removeEntry(temporary.name).catch(() => {})
      .finally(() => temporary.releaseLease?.());
  }
}

async function cleanupStaleOriginalBuffers() {
  // Only v2 files participate in the lease protocol. Do not sweep unknown
  // legacy files or another tab's active playback based only on a filename.
  if (!navigator.storage?.getDirectory || !navigator.locks?.request) return;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY);
    for await (const name of directory.keys()) {
      if (!String(name).startsWith('media-v2-')) continue;
      await navigator.locks.request(`drive-original:media:${name}`, { ifAvailable: true }, async (lock) => {
        if (lock) await directory.removeEntry(name).catch(() => {});
      });
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

function showDrivePreview(file, reason, { userInitiated = false } = {}) {
  if (!file || state.selected?.id !== file.id) return;
  // An exhausted original path is a local failure, never permission to load
  // a third-party document or claim compatibility playback succeeded.
  if (!userInitiated) {
    clearTimeout(mediaRecoveryTimer);
    mediaRecoveryTimer = null;
    state.mediaAbortController?.abort();
    state.mediaAbortController = null;
    clearDirectMediaSources();
    clearDrivePreview();
    state.mediaAttempt = 'failed';
    state.pendingPlay = false;
    state.pendingOriginalBuffer = null;
    state.drivePreviewReason = reason;
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    emitMediaDiagnosticStage('original-playback-unavailable', { reason, terminal: true });
    showMediaError('이 파일을 앱에서 재생하지 못했습니다.', { showDrive: true });
    el.codecNote.textContent = reason;
    el.compatPlayerButton.hidden = false;
    updateQualityDisplay();
    return;
  }
  clearTimeout(mediaRecoveryTimer);
  mediaRecoveryTimer = null;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  clearDrivePreview();
  emitMediaDiagnosticStage('compatibility-selected', {
    route: 'compatibility', reason, terminal: true
  });
  state.mediaSession += 1;
  const previewSession = state.mediaSession;
  updateMediaDiagnosticSession(previewSession, 'compatibility');
  state.mediaAttempt = 'drive-preview-loading';
  state.mediaPlaybackMode = PLAYBACK_MODE.COMPATIBILITY;
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.lastProxyError = null;
  state.pendingPlay = false;
  state.pendingOriginalBuffer = null;
  state.drivePreviewReason = reason;

  setNativeVideoActionsAvailable(false);
  updatePlayPauseUI();
  clearTimeout(controlsHideTimer);
  setPlayerChromeVisible(false);
  el.playerModal?.classList.remove('media-recovery-mode');
  el.mediaStage?.classList.add('drive-preview-active');
  el.playerModal?.classList.add('drive-preview-mode');
  if (el.drivePreviewActions) el.drivePreviewActions.hidden = false;
  showMediaLoading('Google 미리보기 여는 중');

  el.drivePreview.title = `${file.name || '미디어'} · Google Drive 호환 재생기`;
  el.drivePreview.dataset.mediaSession = String(previewSession);
  el.drivePreview.hidden = false;
  el.drivePreview.src = buildDrivePreviewUrl(file);
  el.codecNote.textContent = '직접 선택한 Google 미리보기입니다. 실제 재생과 원본 화질은 앱에서 확인할 수 없습니다.';
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
  showMediaError('Google 미리보기를 불러오지 못했습니다. 원본을 다시 시도하거나 Drive에서 열어 주세요.', {
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
  if (state.accountIdentityPending && !state.demo) return [];
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

const DRIVE_MUTATION_PREFIX = 'drive-original.mutation.v1.';
const DRIVE_MUTATION_FIELDS = 'id,parents,trashed,version,driveId,mimeType,resourceKey,shortcutDetails,ownedByMe,appProperties,capabilities(canTrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren)';
const DRIVE_MUTATION_PENDING = new Set(['submitted', 'verifying', 'uncertain']);

// Candidate-only admission uses a reviewed, persisted creation ledger, never
// caller-supplied ownership metadata. The lease and request registry stay local
// to this document; neither a storage row nor a forged Symbol is a send permit.
const disposableDriveMutations = (() => {
  const issued = new WeakMap();
  let active = null;
  const deny = () => { throw driveMutationError('failed', '일회용 검증 파일의 권한을 확인하지 못했습니다.', 423); };
  const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_-]{5,200}$/.test(id) && id !== 'appDataFolder';
  const sortedParents = value => Array.isArray(value) ? [...value].sort() : null;
  const sameParents = (a, b) => JSON.stringify(sortedParents(a)) === JSON.stringify(sortedParents(b));
  const folderMime = 'application/vnd.google-apps.folder';
  function ledger(scope) {
    let value;
    try { value = JSON.parse(localStorage.getItem(scope.key)); } catch (_) { deny(); }
    if (value?.schema !== 1 || value.run !== scope.run || value.accountKey !== scope.owner.accountKey
      || value.accountId !== scope.owner.accountId || !Array.isArray(value.planned) || !Array.isArray(value.created)
      || new Set(value.planned.map(row => row.id)).size !== value.planned.length
      || new Set(value.created.map(row => row.id)).size !== value.created.length) deny();
    return value;
  }
  function receipt(scope, id, isTarget = false) {
    const value = ledger(scope);
    const planned = value.planned.find(row => row.id === id);
    const created = value.created.find(row => row.id === id);
    if (!idOK(id) || !planned || planned.sent !== true || !created || planned.role !== created.role
      || !(isTarget ? /^folder-[ab]$/.test(created.role) : /^test-(image|video)-[12]$/.test(created.role))) deny();
    const meta = created.metadata;
    if (meta?.id !== id || meta.ownedByMe !== true || meta.driveId || !meta.version
      || typeof meta.version !== 'string' || !/^\d+$/.test(meta.version) || typeof meta.trashed !== 'boolean'
      || !Array.isArray(meta.parents) || meta.parents.length !== 1 || !idOK(meta.parents[0])
      || meta.appProperties?.qaRun !== scope.run || meta.appProperties?.qaRole !== created.role
      || (isTarget ? meta.mimeType !== folderMime : !/^(image|video)\//.test(meta.mimeType))) deny();
    if (!isTarget && !value.created.some(row => row.id === meta.parents[0] && /^folder-[ab]$/.test(row.role)
      && value.planned.some(plan => plan.id === row.id && plan.role === row.role && plan.sent === true))) deny();
    return created;
  }
  function assert(scope) {
    try { scope.owner.assert(); } catch (error) { close(scope); throw error; }
    if (active !== scope || scope.closed || Date.now() >= scope.deadline || scope.signal.aborted
      || state.token !== scope.token || state.tokenRevision !== scope.tokenRevision
      || APP_VERSION !== scope.sourceVersion || location.href !== scope.sourceUrl
      || navigator.serviceWorker?.controller !== scope.controller || !scope.controller
      || !hasUsableToken() || !hasAuthCapability('driveWrite')) { close(scope); deny(); }
  }
  function close(scope) {
    if (!scope || scope.closed) return;
    scope.closed = true;
    scope.signal.removeEventListener('abort', scope.abort);
    window.removeEventListener('pagehide', scope.abort);
    window.removeEventListener('beforeunload', scope.abort);
    scope.permits.forEach(permit => release(permit));
    scope.permits.clear();
    if (active === scope) active = null;
  }
  function activate({ run, fileIds, targetIds, sourceVersion, durationMs = 120_000 } = {}) {
    if (DRIVE_MUTATIONS_ENABLED || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run || '')
      || sourceVersion !== APP_VERSION || !Array.isArray(fileIds) || fileIds.length !== 2
      || new Set(fileIds).size !== 2 || !fileIds.every(idOK)
      || !Array.isArray(targetIds) || !targetIds.length || targetIds.length > 2
      || new Set(targetIds).size !== targetIds.length || !targetIds.every(idOK)
      || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000) deny();
    const owner = captureDriveMutationOwner();
    const scope = { run, owner, files: new Set(fileIds), targets: new Set(targetIds), sourceVersion,
      key: `drive-original.qa.disposable.${run}.recovery`, sourceUrl: location.href,
      token: state.token, tokenRevision: state.tokenRevision, controller: navigator.serviceWorker?.controller,
      signal: owner.options.signal, deadline: Date.now() + durationMs, permits: new Set(), closed: false };
    close(active);
    active = scope;
    scope.abort = () => close(scope);
    scope.signal.addEventListener('abort', scope.abort, { once: true });
    window.addEventListener('pagehide', scope.abort);
    window.addEventListener('beforeunload', scope.abort);
    try {
      assert(scope);
      scope.files.forEach(id => receipt(scope, id));
      scope.targets.forEach(id => receipt(scope, id, true));
    } catch (error) { close(scope); throw error; }
    return Object.freeze({ close: () => close(scope) });
  }
  function select(owner, file, action, target) {
    const scope = active;
    if (!scope) throw driveMutationError('failed', '후보의 파일 변경은 검증 완료 전까지 잠겨 있습니다.', 423);
    assert(scope); owner.assert();
    if (owner.accountKey !== scope.owner.accountKey || owner.accountId !== scope.owner.accountId
      || !scope.files.has(file.id) || !['trash', 'move'].includes(action)
      || (action === 'move' && !scope.targets.has(target?.id))) deny();
    receipt(scope, file.id);
    if (action === 'move') receipt(scope, target.id, true);
    return scope;
  }
  function validate(scope, meta, isTarget = false) {
    assert(scope);
    const row = receipt(scope, meta.id, isTarget);
    if (meta.ownedByMe !== true || meta.driveId || meta.appProperties?.qaRun !== scope.run
      || meta.appProperties?.qaRole !== row.role || meta.mimeType !== row.metadata.mimeType
      || (isTarget ? !/^\d+$/.test(meta.version || '') || !/^\d+$/.test(row.metadata.version)
        || BigInt(meta.version) < BigInt(row.metadata.version) : meta.version !== row.metadata.version)
      || meta.trashed !== row.metadata.trashed
      || !sameParents(meta.parents, row.metadata.parents)) deny();
  }
  async function checkFolders(scope, owner, before, target) {
    assert(scope); owner.assert();
    if (before.parents.length !== 1) deny();
    const ids = new Set([before.parents[0], ...(target ? [target.id] : [])]);
    for (const id of ids) {
      receipt(scope, id, true);
      const folder = target?.id === id ? target : await readDriveMutationMetadata({ id }, owner);
      validate(scope, folder, true);
      if (folder.trashed || folder.capabilities.canAddChildren !== true) deny();
      // Two admitted files fit in one complete page. Any unknown child or
      // continuation makes this QA folder unsuitable; never traverse originals.
      const params = new URLSearchParams({ q: `'${escapeDriveQueryLiteral(id)}' in parents and trashed = false`,
        spaces: 'drive', pageSize: '3', fields: 'nextPageToken,incompleteSearch,files(id)' });
      const response = await driveFetch(`${DRIVE_API}/files?${params}`, { ...owner.options, driveMaxRateAttempts: 1 });
      const children = await response.json();
      assert(scope); owner.assert();
      if (children.incompleteSearch !== false || children.nextPageToken || !Array.isArray(children.files)
        || children.files.length > 2 || new Set(children.files.map(row => row.id)).size !== children.files.length
        || children.files.some(row => !scope.files.has(row.id))) deny();
    }
  }
  function issue(scope, owner, entry, target, url, options) {
    assert(scope); owner.assert();
    if (entry.state !== 'submitted' || !scope.files.has(entry.fileId) || entry.before?.id !== entry.fileId
      || !['trash', 'move'].includes(entry.action) || (entry.action === 'trash' && target)) deny();
    validate(scope, entry.before);
    if (entry.action === 'move') {
      if (!scope.targets.has(target?.id) || entry.targetId !== target.id) deny();
      validate(scope, target, true);
    }
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
    if (entry.action === 'move') { params.set('addParents', target.id); params.set('removeParents', entry.before.parents.join(',')); }
    const expectedUrl = `${DRIVE_API}/files/${encodeURIComponent(entry.fileId)}?${params}`;
    const body = entry.action === 'trash' ? '{"trashed":true}' : '{}';
    if (url !== expectedUrl || options.method !== 'PATCH' || options.body !== body
      || options.driveNoRetry !== true || options.signal !== owner.options.signal || options.signal.aborted) deny();
    const permit = Object.freeze({});
    const abort = () => release(permit);
    const headers = JSON.stringify(Object.entries(options.headers || {}).sort());
    issued.set(permit, { scope, owner, entry, target, url, body, headers, signal: options.signal, abort, expires: Date.now() + 5_000 });
    scope.permits.add(permit);
    options.signal.addEventListener('abort', abort, { once: true });
    return permit;
  }
  function release(permit) {
    const record = issued.get(permit);
    if (record) {
      record.scope.permits.delete(permit);
      record.signal.removeEventListener('abort', record.abort);
    }
    issued.delete(permit);
  }
  function consume(permit, url, options) {
    const record = permit && issued.get(permit);
    if (!record) deny();
    release(permit); // Failed, duplicated, or expired dispatches never regain authority.
    assert(record.scope); record.owner.assert();
    validate(record.scope, record.entry.before);
    if (record.target) validate(record.scope, record.target, true);
    if (Date.now() >= record.expires || url !== record.url || options.method !== 'PATCH'
      || options.body !== record.body || options.driveNoRetry !== true
      || JSON.stringify(Object.entries(options.headers || {}).sort()) !== record.headers
      || options.signal !== record.signal || options.signal.aborted
      || options[ACCOUNT_STATE_WRITE] !== undefined || options[ACCOUNT_STATE_READ] !== undefined) deny();
    return true;
  }
  function confirmed(scope, entry) {
    assert(scope);
    if (entry.state !== 'confirmed' || !scope.files.has(entry.fileId)) deny();
    const value = ledger(scope), row = value.created.find(item => item.id === entry.fileId);
    const after = entry.after;
    if (!row || after?.id !== row.id || after.ownedByMe !== true || after.driveId || !after.version
      || after.appProperties?.qaRun !== scope.run || after.appProperties?.qaRole !== row.role
      || after.mimeType !== row.metadata.mimeType || !driveMutationMatches(entry, after)) deny();
    row.metadata = after;
    try { localStorage.setItem(scope.key, JSON.stringify(value)); }
    catch (_) { throw driveMutationError('uncertain', '일회용 검증 파일의 확인 기록을 저장하지 못했습니다.'); }
  }
  return Object.freeze({ activate, select, validate, checkFolders, issue, consume, release, confirmed });
})();

function activateDisposableDriveMutationLease(options) {
  return disposableDriveMutations.activate(options);
}

function driveMutationError(mutationState, message, status = 0) {
  return Object.assign(new Error(message), { mutationState, status });
}

function captureDriveMutationOwner() {
  const base = captureAccountStateRequest();
  const accountKey = state.authAccountKey;
  const accountId = state.accountId;
  const current = () => base.current() && Boolean(accountKey && accountId)
    && state.authAccountKey === accountKey && state.accountId === accountId && !state.accountIdentityPending && !state.demo;
  const assert = () => {
    if (!current()) throw new DOMException('Drive mutation account changed', 'AbortError');
  };
  assert();
  return { ...base, accountKey, accountId, current, assert,
    prefix: `${DRIVE_MUTATION_PREFIX}${encodeURIComponent(accountKey)}.${encodeURIComponent(accountId)}.` };
}

function readDriveMutations(owner) {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(owner.prefix)) continue;
      const row = JSON.parse(localStorage.getItem(key));
      if (row?.schema !== 1 || row.accountKey !== owner.accountKey || row.accountId !== owner.accountId
        || !row.operationId || key !== owner.prefix + encodeURIComponent(row.operationId)
        || !row.fileId || !['trash', 'move'].includes(row.action) || typeof row.intent !== 'string') throw new Error('Invalid ledger');
      entries.push(row);
    }
    return entries;
  } catch (_) {
    throw driveMutationError('uncertain', '이전 작업 기록을 읽지 못했습니다. 다시 연결해 확인해 주세요.');
  }
}

function persistDriveMutation(entry, owner, nextState) {
  // Origin ownership is immutable even if a response arrives after switching
  // accounts. No token, file name or media body is retained here.
  entry.state = nextState;
  entry.updatedAt = Date.now();
  if (nextState === 'confirmed' && !entry.confirmedAt) {
    entry.confirmedAt = entry.updatedAt;
    entry.confirmedAfter = entry.after;
  }
  const compactMetadata = value => value ? { id: value.id, parents: value.parents,
    trashed: value.trashed, version: value.version, driveId: value.driveId } : null;
  const stored = { ...entry, before: compactMetadata(entry.before), after: compactMetadata(entry.after),
    confirmedAfter: compactMetadata(entry.confirmedAfter) };
  try {
    localStorage.setItem(owner.prefix + encodeURIComponent(entry.operationId), JSON.stringify(stored));
  } catch (_) {
    throw driveMutationError('uncertain', '작업 기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요.');
  }
}

function driveMutationMetadata(value, id, { rootAlias = false } = {}) {
  // A destination (including shared-drive roots) need not itself have parents.
  // Ordinary selected-file pre/post metadata must still contain them.
  if (rootAlias && value?.mimeType === 'application/vnd.google-apps.folder' && value.parents == null) {
    value = { ...value, parents: [] };
  }
  if (!value || (value.id !== id && !(rootAlias && id === 'root' && typeof value.id === 'string' && value.id))
    || typeof value.trashed !== 'boolean' || !Array.isArray(value.parents)
    || value.parents.some(parent => typeof parent !== 'string' || !parent)) {
    throw driveMutationError('uncertain', 'Drive의 파일 상태를 확인하지 못했습니다.');
  }
  return { id: value.id, parents: [...value.parents].sort(), trashed: value.trashed,
    version: typeof value.version === 'string' ? value.version : null,
    driveId: value.driveId || null, mimeType: value.mimeType || '',
    ownedByMe: value.ownedByMe === true, appProperties: { ...(value.appProperties || {}) },
    resourceKey: value.resourceKey || '', capabilities: value.capabilities || {} };
}

async function readDriveMutationMetadata(file, owner, { rootAlias = false } = {}) {
  owner.assert();
  const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
  const resourceKeys = buildResourceKeysHeader([file]);
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params}`, {
    ...owner.options, driveMaxRateAttempts: 1,
    headers: resourceKeys ? { 'X-Goog-Drive-Resource-Keys': resourceKeys } : {}
  });
  const metadata = driveMutationMetadata(await response.json(), file.id, { rootAlias });
  owner.assert();
  return metadata;
}

function driveMutationMatches(entry, metadata) {
  return entry.action === 'trash' ? metadata.trashed === true
    : !metadata.trashed && metadata.parents.length === 1 && metadata.parents[0] === entry.targetId;
}

function driveMutationPreStateMatches(before, after) {
  return Boolean(before && after) && before.trashed === after.trashed && before.driveId === after.driveId
    && JSON.stringify(before.parents) === JSON.stringify(after.parents)
    && (before.version == null || before.version === after.version);
}

async function verifyDriveMutation(entry, owner) {
  // A failed fresh read must not authorize retry using a prior observation.
  // Historical success remains separately immutable in confirmedAfter.
  entry.after = null;
  persistDriveMutation(entry, owner, 'verifying');
  try {
    const after = await readDriveMutationMetadata({ id: entry.fileId, resourceKey: entry.resourceKey }, owner);
    entry.after = after;
    if (driveMutationMatches(entry, after)) persistDriveMutation(entry, owner, 'confirmed');
    else if (!driveMutationPreStateMatches(entry.before, after)) persistDriveMutation(entry, owner, 'conflict');
    else persistDriveMutation(entry, owner, entry.rejectionStatus ? 'failed' : 'uncertain');
  } catch (error) {
    // 404, an unreadable body and account loss are not deletion proof.
    persistDriveMutation(entry, owner, 'uncertain');
  }
  return entry;
}

function driveMutationResult(entry) {
  if (entry.state !== 'confirmed') {
    const message = entry.state === 'conflict' ? '파일 상태가 바뀌었습니다. 새로고침해 확인해 주세요.'
      : entry.state === 'failed' ? 'Drive가 작업을 거절했습니다.' : '작업 결과를 확인 중입니다. 다시 누르면 먼저 결과를 확인합니다.';
    throw Object.assign(driveMutationError(entry.state, message, entry.rejectionStatus || 0), { operationId: entry.operationId });
  }
  return { skipped: Boolean(entry.skipped), metadata: entry.after, operationId: entry.operationId };
}

async function withDriveMutationLock(owner, task) {
  if (!navigator.locks?.request) throw driveMutationError('failed', '안전한 파일 작업을 지원하는 최신 브라우저에서 다시 시도해 주세요.');
  return navigator.locks.request(`${owner.prefix}lock`, async () => {
    owner.assert();
    const controller = new AbortController();
    const abort = () => controller.abort();
    owner.options.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 60_000);
    const boundedOwner = { ...owner, options: { signal: controller.signal }, assert() {
      owner.assert();
      if (controller.signal.aborted) throw new DOMException('Drive operation timed out', 'AbortError');
    } };
    try { return await task(boundedOwner); }
    finally { clearTimeout(timer); owner.options.signal.removeEventListener('abort', abort); }
  });
}

async function executeDriveMutation(file, action, targetRow = null, { operationId = null, retryUnchanged = false } = {}) {
  if (!['trash', 'move'].includes(action) || typeof file?.id !== 'string' || !file.id
    || (action === 'move' && (typeof targetRow?.id !== 'string' || !targetRow.id))) {
    throw driveMutationError('failed', '작업할 파일과 폴더를 다시 선택해 주세요.');
  }
  // Freeze intent inputs before the first asynchronous boundary. Background
  // listing refresh must not silently change an already requested pre-state.
  file = { ...file, parents: Array.isArray(file.parents) ? [...file.parents] : undefined };
  targetRow = targetRow ? { ...targetRow } : null;
  const owner = captureDriveMutationOwner();
  const disposableScope = !DRIVE_MUTATIONS_ENABLED ? disposableDriveMutations.select(owner, file, action, targetRow) : null;
  const intent = JSON.stringify({ fileId: file.id, action, target: targetRow?.id || null,
    expectedParents: Array.isArray(file.parents) ? [...file.parents].sort() : null, expectedVersion: file.version || null });
  return withDriveMutationLock(owner, async (boundedOwner) => {
    const entries = readDriveMutations(owner);
    const duplicate = operationId && entries.find(row => row.operationId === operationId);
    if (duplicate && duplicate.intent !== intent) throw driveMutationError('conflict', '같은 작업 번호에 다른 요청을 보낼 수 없습니다.');
    const pending = entries.find(row => row.fileId === file.id && DRIVE_MUTATION_PENDING.has(row.state));
    let retryEntry = null;
    if (duplicate || pending) {
      const existing = duplicate || pending;
      if (existing.state === 'prepared') persistDriveMutation(existing, owner, 'cancelled-before-submit');
      else if (DRIVE_MUTATION_PENDING.has(existing.state) || existing.state === 'confirmed') await verifyDriveMutation(existing, boundedOwner);
      if (existing.intent !== intent) throw driveMutationError('conflict', '이전 작업 결과를 확인했습니다. 현재 상태에서 다시 선택해 주세요.');
      // Only a new explicit UI action may retry an unknown submission, after
      // this fresh GET proves the exact original version/state is unchanged.
      // Recovery and duplicate operation-ID calls remain strictly read-only.
      if (!operationId && retryUnchanged && existing.state === 'uncertain'
        && existing.before?.version && driveMutationPreStateMatches(existing.before, existing.after)) retryEntry = existing;
      else return driveMutationResult(existing);
    }
    const entry = retryEntry || { schema: 1, operationId: operationId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      accountKey: owner.accountKey, accountId: owner.accountId, fileId: file.id, action, intent,
      resourceKey: file.resourceKey || '', targetId: targetRow?.id || null, before: null, rejectionStatus: 0 };
    if (!retryEntry) persistDriveMutation(entry, owner, 'prepared');
    try {
      const before = await readDriveMutationMetadata(file, boundedOwner);
      if (retryEntry && !driveMutationPreStateMatches(entry.before, before)) {
        persistDriveMutation(entry, owner, 'conflict');
        throw driveMutationError('conflict', '파일 상태가 바뀌었습니다. 새로고침해 주세요.');
      }
      entry.before = before;
      if (disposableScope) disposableDriveMutations.validate(disposableScope, before);
      entry.resourceKey = before.resourceKey || entry.resourceKey;
      if ((file.version && file.version !== before.version)
        || (Array.isArray(file.parents) && JSON.stringify([...file.parents].sort()) !== JSON.stringify(before.parents))) {
        throw driveMutationError('conflict', '파일 위치 또는 버전이 바뀌었습니다. 새로고침해 주세요.');
      }
      let target = null;
      if (action === 'move') {
        target = await readDriveMutationMetadata(targetRow, boundedOwner, { rootAlias: true });
        entry.targetId = target.id;
        if (disposableScope) disposableDriveMutations.validate(disposableScope, target, true);
        if (target.mimeType !== 'application/vnd.google-apps.folder' || target.trashed || target.capabilities.canAddChildren !== true || before.trashed) {
          throw driveMutationError('failed', '이 폴더로 이동할 권한이나 상태를 확인하지 못했습니다.', 403);
        }
      }
      if (disposableScope) await disposableDriveMutations.checkFolders(disposableScope, boundedOwner, before, target);
      if (driveMutationMatches(entry, before)) {
        entry.skipped = true; entry.after = before;
        persistDriveMutation(entry, owner, 'confirmed');
        return driveMutationResult(entry);
      }
      const moveCapability = normalizedDriveId(before) === normalizedDriveId(target) ? 'canMoveItemWithinDrive' : 'canMoveItemOutOfDrive';
      if (before.capabilities[action === 'trash' ? 'canTrash' : moveCapability] !== true) {
        throw driveMutationError('failed', '파일을 변경할 권한이 없습니다.', 403);
      }
      const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
      if (action === 'move') {
        params.set('addParents', entry.targetId);
        params.set('removeParents', before.parents.join(','));
      }
      const resourceKeys = buildResourceKeysHeader([before, target, ...state.moveFolderRows.filter(row => before.parents.includes(row.id))]);
      const headers = { 'Content-Type': 'application/json' };
      if (resourceKeys) headers['X-Goog-Drive-Resource-Keys'] = resourceKeys;
      boundedOwner.assert();
      entry.attempts = (entry.attempts || 0) + 1;
      entry.rejectionStatus = 0;
      persistDriveMutation(entry, owner, 'submitted');
      try {
        // No transparent auth/rate-limit PATCH retries: every possible send is
        // followed by an independent read before any later user intent.
        const url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params}`;
        const options = {
          ...boundedOwner.options, driveNoRetry: true, method: 'PATCH', headers,
          body: action === 'trash' ? JSON.stringify({ trashed: true }) : '{}'
        };
        const permit = disposableScope ? disposableDriveMutations.issue(disposableScope, boundedOwner, entry, target, url, options) : null;
        try {
          if (permit) options[DISPOSABLE_DRIVE_MUTATION] = permit;
          const response = await driveFetch(url, options);
          await response.json();
        } finally { if (permit) disposableDriveMutations.release(permit); }
      } catch (error) {
        if ([400, 401, 403, 404, 409, 412, 429].includes(error?.status)) entry.rejectionStatus = error.status;
      }
      await verifyDriveMutation(entry, boundedOwner);
      if (disposableScope && entry.state === 'confirmed') disposableDriveMutations.confirmed(disposableScope, entry);
      return driveMutationResult(entry);
    } catch (error) {
      if (entry.state === 'prepared') {
        persistDriveMutation(entry, owner,
          error?.name === 'AbortError' ? 'cancelled-before-submit' : error.mutationState === 'conflict' ? 'conflict' : 'failed');
        error.mutationState = entry.state;
      }
      if (DRIVE_MUTATION_PENDING.has(entry.state)) error.mutationState = 'uncertain';
      throw error;
    }
  });
}

async function recoverDriveMutations({ notifyResult = false } = {}) {
  if (state.demo || !state.authAccountKey || !state.accountId || state.accountIdentityPending || !navigator.locks?.request) return;
  const owner = captureDriveMutationOwner();
  return withDriveMutationLock(owner, async boundedOwner => {
    const entries = readDriveMutations(owner);
    let unresolved = 0;
    let confirmed = 0;
    let failed = 0;
    for (const entry of entries) {
      boundedOwner.assert();
      if (entry.state === 'prepared') persistDriveMutation(entry, owner, 'cancelled-before-submit');
      else if (DRIVE_MUTATION_PENDING.has(entry.state)) {
        await verifyDriveMutation(entry, boundedOwner);
        if (entry.state !== 'confirmed' && entry.state !== 'failed') unresolved++;
        else if (entry.state === 'confirmed') confirmed++;
        else failed++;
      }
    }
    if (owner.current() && unresolved) showToast(`${unresolved}개 파일 작업을 확인 중입니다. 새로고침하면 다시 확인합니다.`);
    else if (owner.current() && notifyResult && confirmed + failed) showToast(`이전 작업: ${confirmed}개 확인됨, ${failed}개 실패`);
  }).catch(error => {
    if (owner.current() && error?.name !== 'AbortError') showToast(error.message || '이전 파일 작업의 결과를 확인하지 못했습니다.');
    throw error;
  });
}

function summarizeDriveMutationFailures(results) {
  const counts = { failed: 0, uncertain: 0, conflict: 0, cancelled: 0 };
  for (const result of results) {
    const status = result.reason?.mutationState;
    if (status === 'uncertain' || status === 'submitted' || status === 'verifying') counts.uncertain++;
    else if (status === 'conflict') counts.conflict++;
    else if (status === 'cancelled-before-submit' || result.reason?.name === 'AbortError') counts.cancelled++;
    else counts.failed++;
  }
  return [[counts.failed, '실패'], [counts.uncertain, '확인 중'], [counts.conflict, '다시 확인'], [counts.cancelled, '취소']]
    .filter(([count]) => count).map(([count, label]) => `${count.toLocaleString('ko-KR')}개 ${label}`).join(', ');
}

async function trashDriveFile(file, options) {
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return;
  }
  return executeDriveMutation(file, 'trash', null, options);
}

async function performDeleteFile() {
  const files = actionFilesSnapshot();
  if (!files.length || state.deleting || state.bulkAction) return;
  const owner = captureAccountStateRequest();
  state.deleting = true;
  state.bulkAction = true;
  updateSelectionUI();
  if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = true;
  setButtonLoading(el.deleteConfirmButton, true, files.length > 1 ? `${files.length}개 삭제 중…` : '삭제 중…');
  try {
    const order = getPlaybackFileList();
    const currentId = state.selected?.id || null;
    const removedIndex = currentId ? order.findIndex((file) => file.id === currentId) : -1;
    const results = await runTaskPool(files, async (file) => {
      owner.assert();
      return trashDriveFile(file, { retryUnchanged: true });
    });
    owner.assert();
    const succeeded = results.filter((result) => result.status === 'fulfilled').map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const removedIds = new Set(succeeded.map((file) => file.id));
    if (removedIds.size) invalidateLibraryNavigationData();

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
      failed.forEach(result => clearRejectedToken(result.reason));
      showToast(`${succeeded.length.toLocaleString('ko-KR')}개 휴지통 이동, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(firstError)}`);
    }
  } catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    reportAppFailure('bulk-delete', error);
    if (el.deleteDialog?.open) el.deleteDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearRejectedToken(error);
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
    reportAppFailure('move-dialog', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    state.pendingActionFiles = [];
    if (error?.status === 401) {
      clearRejectedToken(error);
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
    reportAppFailure('root-folder-resolution', err, 'warn');
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
    button.setAttribute('aria-pressed', String(state.moveTargetFolderId === row.id));
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
      el.moveFolderList.querySelectorAll('.move-folder-row').forEach((item) => {
        item.classList.remove('selected');
        item.setAttribute('aria-pressed', 'false');
      });
      button.classList.add('selected');
      button.setAttribute('aria-pressed', 'true');
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

async function moveDriveFile(file, targetRow, options) {
  if (!state.demo) {
    const owner = captureDriveMutationOwner();
    const result = await executeDriveMutation(file, 'move', targetRow, options);
    owner.assert();
    // Only the independent GET may update local parents/capabilities.
    file.parents = [...result.metadata.parents];
    file.driveId = result.metadata.driveId;
    file.version = result.metadata.version;
    file.capabilities = { ...(file.capabilities || {}), ...result.metadata.capabilities };
    return result;
  }
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
}

async function performMoveFile() {
  const files = actionFilesSnapshot();
  const targetRowId = state.moveTargetFolderId;
  if (!files.length || !targetRowId || state.moving || state.bulkAction) return;
  const owner = captureAccountStateRequest();
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
    const results = await runTaskPool(files, async (file) => {
      owner.assert();
      return moveDriveFile(file, targetRow, { retryUnchanged: true });
    });
    owner.assert();
    const moved = results.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).map((result) => result.item);
    const skipped = results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const movedIds = new Set(moved.map((file) => file.id));
    if (movedIds.size) invalidateLibraryNavigationData();

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
      failed.forEach(result => clearRejectedToken(result.reason));
      const skippedText = skipped.length ? `, ${skipped.length.toLocaleString('ko-KR')}개 이미 해당 위치` : '';
      showToast(`${moved.length.toLocaleString('ko-KR')}개 이동${skippedText}, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(failed[0]?.reason)}`);
      if (failed.some((result) => result.reason?.status === 403)) openPermissionGuide();
    }
  } catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    reportAppFailure('bulk-move', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearRejectedToken(error);
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
      el.qualityBadge.dataset.quality = !state.mediaTransportVerified ? 'pending'
        : playbackMode === PLAYBACK_MODE.VIDEO_COMPATIBILITY ? 'video-transformed'
          : playbackMode === PLAYBACK_MODE.AUDIO_COMPATIBILITY ? 'audio-transformed' : 'original';
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
  // Keep diagnostic detail available without narrating normal transport/auth.
  el.mediaLoadingText.textContent = message;
  el.mediaLoadingText.hidden = true;
  el.mediaLoading.hidden = false;
  el.mediaError.hidden = true;
}

function showMediaError(message, { title = '이 파일을 재생할 수 없습니다', showDrive = false, showRetry = true } = {}) {
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
  if (state.mediaBlobUrl) {
    URL.revokeObjectURL(state.mediaBlobUrl);
    state.mediaBlobUrl = null;
  }
  cleanupOriginalTempStorage();
}

function resetMediaElements() {
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

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)
    || matchMedia('(max-width: 600px)').matches;
}

function openSettings(scrollToHelp) {
  if (!el.settingsDialog.open) el.settingsDialog.showModal();
  if (scrollToHelp) requestAnimationFrame(() => el.setupHelpSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

async function postAuthAction(path, body = {}) {
  if (!navigator.onLine) return { ok: false, payload: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_MUTATION_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, location.origin), {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      mode: 'same-origin',
      redirect: 'error',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        [AUTH_CSRF_HEADER]: '1'
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await readAuthJson(response);
    return { ok: response.ok && Boolean(payload) && !payload.error, payload };
  } catch (_) {
    return { ok: false, payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

async function logout() {
  if (el.logoutButton) el.logoutButton.disabled = true;
  const result = await postAuthAction(AUTH_LOGOUT_PATH);
  if (el.logoutButton) el.logoutButton.disabled = false;
  if (!result.ok || result.payload?.loggedOut !== true) {
    showToast('로그아웃하지 못했습니다. 연결 상태를 확인해 주세요.');
    return;
  }
  clearStandaloneAuthAttempt();
  clearToken(true, { preserveAccount: false });
  invalidateDriveSessionData();
  state.selected = null;
  closePlayer();
  if (el.settingsDialog.open) el.settingsDialog.close();
  showSetup();
  showToast('이 브라우저 세션에서 로그아웃했습니다.');
}

async function disconnect() {
  if (!state.authAccountKey) {
    showToast('연결된 Google 계정이 없습니다.');
    return;
  }
  if (!window.confirm('모든 로그인 세션과 서버에 보관된 계정 인증 정보를 삭제하고 Google 연결을 해제할까요?')) return;
  el.disconnectButton.disabled = true;
  const result = await postAuthAction(AUTH_DISCONNECT_PATH, { expectedAccount: state.authAccountKey });
  el.disconnectButton.disabled = false;
  if (!result.ok || result.payload?.disconnected !== true) {
    showToast('연결을 해제하지 못했습니다. 연결 상태를 확인해 주세요.');
    return;
  }
  clearStandaloneAuthAttempt();
  clearToken(true, { preserveAccount: false });
  invalidateDriveSessionData();
  state.selected = null;
  closePlayer();
  if (el.settingsDialog.open) el.settingsDialog.close();
  showSetup();
  if (result.payload.revocation === 'confirmed') {
    showToast('앱 세션과 Google Drive 연결을 해제했습니다.');
  } else {
    setAuthError('앱 세션은 삭제했지만 Google 권한 폐기는 확인되지 않았습니다. Google 계정의 연결된 앱에서 Drive Original 권한을 확인해 주세요.');
    showToast('앱 세션은 삭제됐지만 Google 권한 폐기는 확인되지 않았습니다.');
  }
}

function clearToken(notifyWorker, { preserveAccount = true } = {}) {
  const clearedAccount = state.authAccountKey;
  const clearedRevision = state.tokenRevision;
  const clearedAccountGeneration = state.driveSessionGeneration;
  stopAccountStateRefresh();
  state.authGeneration += 1;
  state.accountStateAbortController?.abort();
  state.accountStateAbortController = null;
  credentialRequestAbortController?.abort();
  credentialRequestAbortController = null;
  credentialRequestPromise = null;
  credentialRequestGeneration = -1;
  credentialRequestOutcome = null;
  sessionCredentialMarker = null;
  state.token = null;
  state.authCapabilities = null;
  state.expiresAt = 0;
  if (!preserveAccount) {
    state.authAccountKey = null;
    state.tokenRevision = 0;
    state.authStatus = 'anonymous';
  } else if (state.authStatus === 'online') {
    state.authStatus = 'reconnect-required';
  }
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  } catch (_) {}
  if (notifyWorker && navigator.serviceWorker) {
    const message = {
      type: 'CLEAR_TOKEN',
      credentialProtocol: AUTH_PROTOCOL,
      account: clearedAccount,
      revision: clearedRevision,
      accountGeneration: clearedAccountGeneration
    };
    navigator.serviceWorker.controller?.postMessage(message);
    const registration = state.serviceWorkerRegistration;
    [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
  }
}

function invalidateDriveSessionData() {
  completedMediaSeekPresentation = null;
  stopAccountStateRefresh();
  state.accountStateRefreshFailures = 0;
  state.accountStateRefreshNotBefore = 0;
  state.accountStateRefreshBlocked = false;
  resetLibraryNavigation();
  state.previousAccountId = state.accountId || state.previousAccountId;
  state.accountIdentityPending = true;
  state.driveSessionGeneration += 1;
  state.accountStateAbortController?.abort();
  state.accountStateAbortController = null;
  state.accountStateReadCache.clear();
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
  clearTimeout(state.accountStateSyncRetryTimer);
  state.accountStateSyncRetryTimer = null;
  state.accountId = null;
  state.accountMediaState = createEmptyAccountMediaState();
  state.accountStateFileId = null;
  state.accountStateLoaded = false;
  state.accountStateLoadingPromise = null;
  state.accountStateSyncPromise = null;
  state.accountStateLastSyncAt = 0;
  state.accountStateSyncRetryCount = 0;
  state.accountStateSyncError = null;
  state.accountLocalStorageError = false;
  cancelFavoriteLoad();
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

function clearRejectedToken(error) {
  if (error?.status !== 401 || error.rejectedTokenRevision == null) return;
  if (error.rejectedTokenRevision === (state.tokenRevision || 0)
    && error.rejectedAccountGeneration === state.driveSessionGeneration) clearToken(true);
}

function showSetup() {
  el.setupView.hidden = false;
  el.libraryView.hidden = true;
  updateConnectionBadge();
}

function showReconnectState() {
  if (!state.accountId || state.accountIdentityPending) { showSetup(); return; }
  updateConnectionBadge();
  if (hasUsableToken()) return;
  const button = document.getElementById?.('reconnectButton');
  if (button) button.hidden = false;
}

function showLibrary() {
  el.setupView.hidden = true;
  el.libraryView.hidden = false;
}

function setConnectBusy(busy, busyLabel = 'Google 연결 대기 중…') {
  el.connectButton.disabled = busy;
  const reconnect = document.getElementById?.('reconnectButton');
  if (reconnect) reconnect.disabled = busy;
  const label = el.connectButton.querySelector('span');
  if (label) label.textContent = busy ? busyLabel : 'Google Drive에 연결';
}

function setBootstrapAuthPending(pending) {
  const active = Boolean(pending);
  setConnectBusy(active, '기존 Drive 연결 확인 중…');
  el.setupView?.setAttribute?.('aria-busy', String(active));
  updateConnectionBadge(active ? 'busy' : undefined);
}

function updateConnectionBadge(forcedState) {
  const reconnect = document.getElementById?.('reconnectButton');
  if (reconnect) {
    const partial = state.authCapabilities && ['driveRead', 'driveWrite', 'appData'].some(feature => !hasAuthCapability(feature));
    reconnect.hidden = Boolean(state.demo || (hasUsableToken() && !partial) || (!state.accountId && !partial));
  }
  const badgeState = forcedState || (!navigator.onLine ? 'offline' : hasUsableToken() || state.demo ? 'online' : 'offline');
  el.connectionBadge.dataset.state = badgeState;
  const label = el.connectionBadge.querySelector('.badge-text') || el.connectionBadge.querySelector('span:last-child');
  if (label) {
    if (badgeState === 'busy') label.textContent = '연결 중…';
    else if (!navigator.onLine) label.textContent = '오프라인';
    else if (badgeState === 'online') label.textContent = state.demo ? '데모 모드' : 'Drive 연결됨';
    else if (state.authStatus === 'reconnect-required') label.textContent = '재연결 필요';
    else if (state.authStatus === 'auth-unavailable') label.textContent = '인증 일시 중단';
    else label.textContent = '연결 안 됨';
  }
}

function hasUsableToken() {
  return Boolean(state.token && Date.now() < state.expiresAt - TOKEN_SKEW_MS);
}

function setAuthError(message) {
  el.authHint.textContent = message;
  el.authHint.classList.add('error');
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
        reportAppFailure('gif-thumbnail-capture', error, 'warn');
        entry.canvas.width = 1;
        entry.canvas.height = 1;
        finish(false);
      }
    };
    image.onerror = () => finish(false);
    image.src = entry.file.thumbnailLink;
  }
}

function clearAuthError() {
  el.authHint.textContent = 'Google 로그인에서 계정과 Drive 권한을 확인합니다.';
  el.authHint.classList.remove('error');
}

function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

function beginLibraryStatus(message) {
  const token = state.libraryStatusToken + 1;
  state.libraryStatusToken = token;
  if (el.libraryStatus) el.libraryStatus.textContent = message || '';
  return token;
}

function updateLibraryStatus(token, message) {
  if (token !== state.libraryStatusToken) return false;
  if (el.libraryStatus) el.libraryStatus.textContent = message || '';
  return true;
}

function clearLibraryStatus() {
  return beginLibraryStatus('');
}

function humanizeDriveError(error) {
  if (error?.code === 'insufficient_scope') return error.message;
  if (error?.code === 'candidate_read_only') return '현재 검증 후보는 계정 상태 비교가 끝날 때까지 Drive 변경을 잠시 막습니다.';
  if (error.status === 401) return '인증이 만료됐습니다.';
  if (error.status === 403) {
    const reasons = Array.isArray(error.reasons) ? error.reasons : [];
    if (reasons.some((reason) => /accessNotConfigured|serviceDisabled/i.test(reason))) {
      return 'Google Cloud 프로젝트에서 Drive API를 사용 설정해 주세요.';
    }
    if (reasons.some((reason) => /^insufficientPermissions$/i.test(reason))) {
      return '이 기능의 Google 권한이 부족합니다. 다시 연결해 주세요.';
    }
    return '현재 계정에서 이 Drive 항목에 접근할 권한이 없습니다.';
  }
  if (error.status === 404) return '파일이 삭제되었거나 현재 계정에서 더 이상 볼 수 없습니다.';
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
  beginLibraryStatus('데모 모드 — 실제 Google Drive 요청은 실행하지 않습니다.');
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
