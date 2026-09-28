function (backup, swProof, journalKey) {
  const initialProjection = JSON.parse(JSON.stringify(state.accountMediaState));
  const initialCache = localStorage.getItem(accountStateCacheKey(state.accountId));
  const initialWriterStorage = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
  const owner = {
    accountId: state.accountId, key: state.authAccountKey,
    auth: state.authGeneration, drive: state.driveSessionGeneration,
    revision: state.tokenRevision, token: state.token, expiry: state.expiresAt,
    controller: navigator.serviceWorker.controller, accountAbort: state.accountStateAbortController,
    mediaSession: state.mediaSession, sourceGeneration: mediaSourceGeneration,
    retirement: q1RetirementResult, writerId: state.accountStateWriterId,
    localRevision: state.accountStateRevision,
  };
  const rootAbort = new AbortController(), abort = () => rootAbort.abort();
  const current = () => !rootAbort.signal.aborted
    && APP_VERSION === '1.22.0-rc.10' && DRIVE_MUTATIONS_ENABLED === false
    && location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    && top === self && navigator.onLine === true && document.visibilityState === 'visible'
    && navigator.serviceWorker.controller === owner.controller && owner.controller?.state === 'activated'
    && swProof.get()?.version === APP_VERSION
    && state.accountId === owner.accountId && state.authAccountKey === owner.key
    && state.authGeneration === owner.auth && state.driveSessionGeneration === owner.drive
    && state.tokenRevision === owner.revision && state.token === owner.token && state.expiresAt === owner.expiry
    && state.authStatus === 'online' && state.demo === false && hasUsableToken()
    && state.accountStateLoaded === true && !state.accountIdentityPending && !state.accountStateSyncPromise
    && state.accountStateAbortController === owner.accountAbort && Boolean(owner.accountAbort?.signal)
    && !owner.accountAbort.signal.aborted
    && state.mediaSession === owner.mediaSession && mediaSourceGeneration === owner.sourceGeneration
    && q1RetirementResult === owner.retirement && state.accountStateWriterId === owner.writerId
    && state.accountStateRevision === owner.localRevision
    && state.selected === null && state.mediaAttempt === 'idle' && state.mediaAbortController === null
    && state.pendingOriginalBuffer === null && state.pendingPlay === false && state.mediaTransportStarted === false
    && q1Playback === null && q1RetirementResult?.settled === true && !playerMediaPriorityActive
    && accountMediaStatesEqual(state.accountMediaState, initialProjection)
    && localStorage.getItem(accountStateCacheKey(owner.accountId)) === initialCache
    && localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === initialWriterStorage;
  if (!current() || owner.expiry - Date.now() < 60_000 || !navigator.locks?.request
    || !owner.accountId || !owner.token || !initialCache || initialWriterStorage !== owner.writerId
    || !/^drive-original\.qa\.own-writer\.[A-Za-z0-9_-]{8,100}$/.test(journalKey)
    || localStorage.getItem(journalKey) !== null) throw new Error('OWN_WRITER_PREFLIGHT_REJECTED');
  const events = ['pagehide', 'beforeunload'];
  for (const event of events) window.addEventListener(event, abort, { once: true });
  owner.accountAbort.signal.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    for (const event of events) window.removeEventListener(event, abort);
    owner.accountAbort.signal.removeEventListener('abort', abort);
  };
  const check = () => { if (!current()) throw Object.assign(new Error('stale_owner'), { code: 'stale_owner' }); };
  const readCandidate = () => {
    let cachedRemote = createEmptyAccountMediaState();
    for (const entry of state.accountStateReadCache.values()) cachedRemote = mergeAccountMediaStates(cachedRemote, entry.data);
    return { accountId: owner.accountId, cacheText: localStorage.getItem(accountStateCacheKey(owner.accountId)),
      runtimeProjection: JSON.parse(JSON.stringify(state.accountMediaState)),
      pending: !accountMediaStatesEqual(mergeAccountMediaStates(cachedRemote, state.accountMediaState), cachedRemote),
      writerId: state.accountStateWriterId, writerStorageText: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) };
  };
  let gets = 0, posts = 0, journalText = null;
  const read = (address, options) => {
    check();
    const url = new URL(address), keys = [...url.searchParams.keys()].sort();
    const allowed = url.origin === 'https://www.googleapis.com' && !url.hash && !url.username && !url.password
      && options?.method === 'GET' && !options.headers && !options.body && options.signal
      && ((url.pathname === '/drive/v3/about' && keys.join(',') === 'fields' && url.searchParams.get('fields') === 'user(permissionId)')
      || (url.pathname === '/drive/v3/files' && url.searchParams.get('spaces') === 'appDataFolder'
        && url.searchParams.get('pageSize') === '1000'
        && url.searchParams.get('q') === "(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false"
        && url.searchParams.get('fields') === 'nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)'
        && keys.every(key => ['spaces', 'pageSize', 'q', 'fields', 'pageToken'].includes(key)))
      || (/^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname) && keys.join(',') === 'alt' && url.searchParams.get('alt') === 'media'));
    if (!allowed) throw Object.assign(new Error('write_policy'), { code: 'write_policy' });
    gets++;
    return fetch(url.href, { method: 'GET', headers: { Authorization: `Bearer ${owner.token}` },
      signal: options.signal, cache: 'no-store', redirect: 'error', credentials: 'omit', priority: 'low' });
  };
  const dispatch = async (url, options) => {
    check();
    if (posts || url !== 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime'
      || options.method !== 'POST' || !options.signal || options.signal.aborted
      || !journalText || localStorage.getItem(journalKey) !== journalText
      || JSON.parse(journalText).stage !== 'attempt_claimed') throw Object.assign(new Error('write_policy'), { code: 'write_policy' });
    posts++;
    const response = await fetch(url, { method: 'POST', headers: {
      'Content-Type': options.headers['Content-Type'], Authorization: `Bearer ${owner.token}` }, body: options.body,
      signal: options.signal, cache: 'no-store', redirect: 'error', credentials: 'omit' });
    // Status only. Body is cancelled; authoritative metadata comes from the
    // fresh complete raw readback while the same real writer lock is held.
    await response.body?.cancel();
    return response.status;
  };
  const journal = value => {
    check();
    if (localStorage.getItem(journalKey) !== journalText) return false;
    const text = JSON.stringify(value);
    localStorage.setItem(journalKey, text);
    if (localStorage.getItem(journalKey) !== text) return false;
    journalText = text;
    return true;
  };
  let handle;
  try {
    handle = this({ backup, readCandidate, normalize: normalizeAccountMediaState, merge: mergeAccountMediaStates,
      isCurrent: current, read, dispatch, journal, signal: rootAbort.signal,
      lock: (name, options, callback) => { check(); return navigator.locks.request(name, options, callback); } });
  } catch (cause) { rootAbort.abort(); cleanup(); throw cause; }
  let done = false;
  return {
    async run(budgetMs) {
      try { return await handle.run(budgetMs); }
      finally { done = true; cleanup(); }
    },
    poll: () => ({ done, gets, posts, ownerCurrent: current(), summary: handle.safeSummary() }),
    privateJournal: () => localStorage.getItem(journalKey),
    clear: () => { rootAbort.abort(); handle.clear(); cleanup(); },
  };
}
