'use strict';

// Shared constants and pure helpers (account-state merge, playback deck, render window, buffer policy).
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const APP_VERSION = '1.23.12';
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
const SOURCE_CLEANUP_UNCONFIRMED_MESSAGE = '이전 원본 연결 정리가 확인되지 않았습니다. 앱을 새로 열어 다시 시도하세요.';
const RENDER_WINDOW_MAX = 240;
const RENDER_WINDOW_STEP_RATIO = 0.5;
const MOVE_RESULT_BATCH = 200;
const FOLDER_RENDER_MAX = 200;
const SEARCH_RENDER_DELAY_MS = 90;
const BULK_ACTION_CONCURRENCY = 4;
const DEEP_SCAN_CONCURRENCY = 4;
const DEFAULT_FRAME_DURATION = 1 / 30;
const MEDIA_ERROR_CLASSIFY_DELAY_MS = 180;
const MEDIA_FRAME_NO_PROGRESS_TIMEOUT_MS = 15_000;
const MEDIA_SEEK_COMPLETION_TIMEOUT_MS = 15_000;
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
const MEDIA_FILE_FIELDS = 'id,name,mimeType,size,modifiedTime,headRevisionId,resourceKey,thumbnailLink,hasThumbnail,webViewLink,driveId,capabilities(canDownload,canDelete,canMoveItemOutOfDrive,canMoveItemWithinDrive),parents,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation)';
// Revision identity read that pins every original source to one exact Drive revision.
async function readSourceRevisionMetadata(file, signal) {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set('fields', 'id,headRevisionId,version,size,mimeType,modifiedTime,sha256Checksum,trashed,capabilities(canDownload)');
  url.searchParams.set('supportsAllDrives', 'true');
  const headers = file.resourceKey ? { 'X-Goog-Drive-Resource-Keys': `${file.id}/${file.resourceKey}` } : {};
  return (await driveFetch(url.href, { signal, headers })).json();
}

// One page of a folder's direct children: subfolders and supported media.
function folderListingParams(folderId) {
  return new URLSearchParams({
    pageSize: String(DRIVE_PAGE_SIZE),
    orderBy: 'folder,modifiedTime desc',
    q: `trashed = false and '${folderId}' in parents and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/' or mimeType contains 'image/')`,
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: `nextPageToken,incompleteSearch,files(${MEDIA_FILE_FIELDS})`
  });
}
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

// Same membership as normalizing the whole state first, without copying the
// unbounded viewed history to answer a favorites or viewed-only question.
function accountFavoriteIds(accountState) {
  const favorites = accountState?.favorites;
  const ids = new Set();
  Object.entries(favorites && typeof favorites === 'object' ? favorites : {}).forEach(([id, entry]) => {
    if (id && (entry && typeof entry === 'object' ? entry.liked : entry)) ids.add(id);
  });
  return ids;
}

function accountViewedIds(accountState) {
  const viewed = accountState?.viewed;
  const ids = new Set();
  Object.entries(viewed && typeof viewed === 'object' ? viewed : {}).forEach(([id, timestamp]) => {
    if (id && normalizeStateTimestamp(timestamp)) ids.add(id);
  });
  return ids;
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
  // A list that fits one window always starts at the top; a stale offset after
  // deletes or moves would otherwise leave unrecoverable blank leading rows.
  if (total <= windowSize) return { start: 0, end: total };

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

