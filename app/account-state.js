'use strict';

// Watched/liked account state cache, appDataFolder sync and view observation.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function escapeDriveQueryLiteral(value) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function accountStateCacheKey(accountId = state.accountId) {
  return accountId ? `${ACCOUNT_STATE_CACHE_PREFIX}${accountId}` : '';
}

// The cache text this context last wrote and a private normalized copy of it.
// While the stored text is unchanged, persisting merges with that copy instead
// of parsing and validating the whole (unbounded) viewed history again.
let lastPersistedAccountState = null;

function readCachedAccountMediaStateSnapshot(accountId) {
  const key = accountStateCacheKey(accountId);
  if (!key) return createEmptyAccountMediaState();
  try {
    const text = localStorage.getItem(key);
    if (text === null) return createEmptyAccountMediaState();
    if (lastPersistedAccountState?.key === key && lastPersistedAccountState.text === text) return lastPersistedAccountState.value;
    return normalizeAccountMediaState(validateRawAccountMediaState(JSON.parse(text), true));
  } catch (_) {
    state.accountLocalStorageError = true;
    throw accountStateError('invalid_account_state_cache');
  }
}

function readCachedAccountMediaState(accountId) {
  // Callers own and mutate the returned state; never hand out the shared snapshot.
  const snapshot = readCachedAccountMediaStateSnapshot(accountId);
  return snapshot === lastPersistedAccountState?.value ? normalizeAccountMediaState(snapshot) : snapshot;
}

function persistAccountMediaState() {
  const key = accountStateCacheKey();
  if (!key) return;
  try {
    const merged = mergeAccountMediaStates(readCachedAccountMediaStateSnapshot(state.accountId), state.accountMediaState);
    applyMergedAccountMediaState(merged);
    // A merge result is already normalized, so it serializes exactly like its normalized copy.
    const text = JSON.stringify(merged);
    lastPersistedAccountState = null;
    localStorage.setItem(key, text);
    lastPersistedAccountState = { key, text, value: normalizeAccountMediaState(merged) };
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
  if (state.filter !== 'favorites' || state.loadingFavorites
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

function accountStateReadCacheKey(accountId = state.accountId) {
  return accountId ? `${ACCOUNT_STATE_READ_CACHE_PREFIX}${accountId}` : '';
}

// Writer files are read again only when their Drive modifiedTime changes, so a
// reload reuses the copies this browser already read instead of downloading
// every device's file. Storage is a best-effort shortcut, never a source.
function restoreAccountStateReadCache(accountId) {
  const key = accountStateReadCacheKey(accountId);
  if (!key) return;
  try {
    const stored = JSON.parse(localStorage.getItem(key) || 'null');
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return;
    Object.entries(stored).forEach(([fileId, entry]) => {
      if (!/^[A-Za-z0-9_-]{1,200}$/.test(fileId) || typeof entry?.modifiedTime !== 'string' || !entry.modifiedTime) return;
      try {
        const data = normalizeAccountMediaState(validateRawAccountMediaState(entry.data, true));
        state.accountStateReadCache.set(fileId, { modifiedTime: entry.modifiedTime, data });
      } catch (_) {}
    });
  } catch (_) {}
}

function persistAccountStateReadCache(accountId) {
  const key = accountStateReadCacheKey(accountId);
  if (!key || accountId !== state.accountId) return;
  const entries = {};
  state.accountStateReadCache.forEach((entry, fileId) => {
    if (entry?.modifiedTime) entries[fileId] = { modifiedTime: entry.modifiedTime, data: entry.data };
  });
  try { localStorage.setItem(key, JSON.stringify(entries)); }
  catch (_) { try { localStorage.removeItem(key); } catch (__) {} }
}

async function readRemoteAccountMediaState(catalog, options = {}) {
  const files = Array.isArray(catalog?.files) ? catalog.files : (catalog?.id ? [catalog] : []);
  const cache = state.accountStateReadCache;
  const accountId = state.accountId;
  let changed = false;
  if (Array.isArray(catalog?.files)) {
    const listed = new Set(files.map(file => file.id));
    [...cache.keys()].forEach((fileId) => { if (!listed.has(fileId)) changed = cache.delete(fileId) || changed; });
  }
  const results = await runTaskPool(files, async (file) => {
    if (options.signal?.aborted) throw new DOMException('Account request aborted', 'AbortError');
    const cached = cache.get(file.id);
    if (file.modifiedTime && cached?.modifiedTime === file.modifiedTime) return cached.data;
    try {
      const data = await readAccountStateFile(file.id, options, file.name === ACCOUNT_STATE_FILE_NAME);
      if (options.signal?.aborted) throw new DOMException('Account request aborted', 'AbortError');
      cache.set(file.id, { modifiedTime: file.modifiedTime, data });
      changed = true;
      return data;
    } catch (error) {
      if (error?.status === 404) cache.delete(file.id);
      throw error;
    }
  }, ACCOUNT_STATE_READ_CONCURRENCY);
  if (changed) persistAccountStateReadCache(accountId);
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
    if (!state.accountStateReadCache.size) restoreAccountStateReadCache(accountId);
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

function applyFavoriteButtonState(button, liked) {
  button.setAttribute('aria-pressed', String(liked));
  button.setAttribute('aria-label', liked ? '좋아요 취소' : '좋아요 추가');
  button.title = liked ? '좋아요 취소' : '좋아요';
  button.classList.toggle('is-favorite', liked);
}

function refreshFavoritePresentation() {
  const selectedLiked = isFavoriteFileId(state.selected?.id);
  [el.topbarFavoriteBtn, el.ctrlFavorite, el.shortsFavoriteBtn].forEach((button) => {
    if (button) applyFavoriteButtonState(button, selectedLiked);
  });
  document.querySelectorAll?.('.file-card-favorite').forEach((button) => {
    applyFavoriteButtonState(button, isFavoriteFileId(button.dataset.fileId));
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

