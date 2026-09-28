function (legacyLocal, swProof) {
  const sameProjection = (a, b) => accountMediaStatesEqual(a, b);
  const initialProjection = JSON.parse(JSON.stringify(state.accountMediaState));
  const initialCache = localStorage.getItem(accountStateCacheKey(state.accountId));
  const initialWriterStorage = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
  const owner = {
    accountId: state.accountId, key: state.authAccountKey,
    auth: state.authGeneration, drive: state.driveSessionGeneration,
    revision: state.tokenRevision, token: state.token, expiry: state.expiresAt,
    controller: navigator.serviceWorker.controller,
    accountAbort: state.accountStateAbortController,
    mediaSession: state.mediaSession, sourceGeneration: mediaSourceGeneration,
    retirement: q1RetirementResult, writerId: state.accountStateWriterId,
  };
  const rootAbort = new AbortController();
  const abort = () => rootAbort.abort();
  const idle = () => state.selected === null && state.mediaAttempt === 'idle'
    && state.mediaAbortController === null && state.pendingOriginalBuffer === null
    && state.pendingPlay === false && state.mediaTransportStarted === false
    && q1Playback === null && q1RetirementResult?.settled === true && !playerMediaPriorityActive;
  const current = () => !rootAbort.signal.aborted
    && APP_VERSION === '1.22.0-rc.10' && DRIVE_MUTATIONS_ENABLED === false
    && location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    && top === self && navigator.onLine === true && document.visibilityState === 'visible'
    && navigator.serviceWorker.controller === owner.controller
    && owner.controller?.state === 'activated' && swProof.get()?.version === APP_VERSION
    && state.accountId === owner.accountId && state.authAccountKey === owner.key
    && state.authGeneration === owner.auth && state.driveSessionGeneration === owner.drive
    && state.tokenRevision === owner.revision && state.token === owner.token && state.expiresAt === owner.expiry
    && state.authStatus === 'online' && state.demo === false && hasUsableToken()
    && state.accountStateLoaded === true && !state.accountIdentityPending && !state.accountStateSyncPromise
    && state.accountStateAbortController === owner.accountAbort && Boolean(owner.accountAbort?.signal)
    && !owner.accountAbort.signal.aborted
    && state.mediaSession === owner.mediaSession && mediaSourceGeneration === owner.sourceGeneration
    && q1RetirementResult === owner.retirement && state.accountStateWriterId === owner.writerId && idle()
    && sameProjection(state.accountMediaState, initialProjection)
    && localStorage.getItem(accountStateCacheKey(owner.accountId)) === initialCache
    && localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === initialWriterStorage;
  if (!current() || !owner.accountId || !owner.token || !initialCache || !owner.writerId) throw new Error('BACKUP_PREFLIGHT_REJECTED');
  const events = ['pagehide', 'beforeunload'];
  for (const event of events) window.addEventListener(event, abort, { once: true });
  owner.accountAbort.signal.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    for (const event of events) window.removeEventListener(event, abort);
    owner.accountAbort.signal.removeEventListener('abort', abort);
  };
  const readCandidate = () => {
    let cachedRemote = createEmptyAccountMediaState();
    for (const entry of state.accountStateReadCache.values()) {
      cachedRemote = mergeAccountMediaStates(cachedRemote, entry.data);
    }
    return {
      accountId: owner.accountId,
      cacheText: localStorage.getItem(accountStateCacheKey(owner.accountId)),
      runtimeProjection: JSON.parse(JSON.stringify(state.accountMediaState)),
      pending: !sameProjection(mergeAccountMediaStates(cachedRemote, state.accountMediaState), cachedRemote),
      writerId: state.accountStateWriterId,
      writerStorageText: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY),
    };
  };
  let nativeDispatches = 0;
  const read = (address, options) => {
    if (!current()) throw Object.assign(new Error('stale_owner'), { code: 'stale_owner' });
    const url = new URL(address);
    const keys = [...url.searchParams.keys()].sort();
    const permitted = url.origin === 'https://www.googleapis.com' && !url.hash && !url.username && !url.password
      && options?.method === 'GET' && !options.headers && !options.body && options.signal
      && ((url.pathname === '/drive/v3/about' && keys.join(',') === 'fields'
        && url.searchParams.get('fields') === 'user(permissionId)')
      || (url.pathname === '/drive/v3/files' && url.searchParams.get('spaces') === 'appDataFolder'
        && url.searchParams.get('pageSize') === '1000'
        && url.searchParams.get('q') === "(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false"
        && url.searchParams.get('fields') === 'nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)'
        && keys.every(key => ['spaces', 'pageSize', 'q', 'fields', 'pageToken'].includes(key)))
      || (/^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname)
        && keys.join(',') === 'alt' && url.searchParams.get('alt') === 'media'));
    if (!permitted) throw Object.assign(new Error('invalid_transport'), { code: 'invalid_transport' });
    nativeDispatches++;
    return fetch(url.href, { method: 'GET', headers: { Authorization: `Bearer ${owner.token}` },
      signal: options.signal, cache: 'no-store', redirect: 'error', credentials: 'omit', priority: 'low' });
  };
  let handle;
  try {
    handle = this({ read, readCandidate, legacyLocal, expectedAccountId: owner.accountId,
      normalize: normalizeAccountMediaState, merge: mergeAccountMediaStates,
      isCurrent: current, signal: rootAbort.signal, evidence: { projectClientBinding: 'unknown' } });
  } catch (cause) {
    rootAbort.abort(); cleanup(); throw cause;
  }
  let done = false;
  const capture = handle.capture().then(() => { done = true; }).finally(cleanup);
  return {
    poll: () => ({ done, nativeDispatches, summary: handle.safeSummary(), ownerCurrent: current() }),
    privateText: () => handle.readPrivateText(),
    verifyReread: text => handle.verifyReread(text),
    clear: () => { rootAbort.abort(); handle.clear(); cleanup(); },
    settled: () => capture,
  };
}
