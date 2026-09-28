function (expectedProjection, allowedFileIds, budgetMs) {
  const initialProjection = JSON.parse(JSON.stringify(state.accountMediaState));
  const cacheText = localStorage.getItem(accountStateCacheKey(state.accountId));
  const writerText = localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY);
  const owner = {
    accountId: state.accountId, key: state.authAccountKey,
    auth: state.authGeneration, drive: state.driveSessionGeneration,
    token: state.token, tokenRevision: state.tokenRevision, expiry: state.expiresAt,
    controller: navigator.serviceWorker.controller, abort: state.accountStateAbortController,
    writerId: state.accountStateWriterId, revision: state.accountStateRevision,
    mediaSession: state.mediaSession, sourceGeneration: mediaSourceGeneration,
    retirement: q1RetirementResult,
  };
  const ids = new Set(allowedFileIds);
  if (ids.size !== allowedFileIds.length || ids.size < 1 || ids.size > 64
    || [...ids].some(id => !/^[A-Za-z0-9_-]{1,200}$/.test(id))) throw new Error('FRESH_CACHE_PREFLIGHT');
  const aborter = new AbortController();
  const abort = () => aborter.abort();
  let lastGuardFailures = [];
  const current = () => {
    const checks = {
      scopeActive: !aborter.signal.aborted,
      runtime: APP_VERSION === '1.22.0-rc.11' && DRIVE_MUTATIONS_ENABLED === false,
      origin: location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev' && top === self,
      foreground: navigator.onLine && document.visibilityState === 'visible',
      controller: navigator.serviceWorker.controller === owner.controller && owner.controller?.state === 'activated',
      account: state.accountId === owner.accountId && state.authAccountKey === owner.key,
      authGeneration: state.authGeneration === owner.auth,
      driveGeneration: state.driveSessionGeneration === owner.drive,
      token: state.token === owner.token && state.tokenRevision === owner.tokenRevision && state.expiresAt === owner.expiry,
      credentialUsable: state.authStatus === 'online' && !state.demo && hasUsableToken(),
      stateReady: state.accountStateLoaded && !state.accountIdentityPending,
      readIdle: !state.accountStateLoadingPromise,
      writesIdle: !state.accountStateSyncPromise && !state.accountStateSyncTimer && !state.accountStateSyncRetryTimer && !state.accountStateSyncError,
      stateAbort: state.accountStateAbortController === owner.abort && owner.abort?.signal && !owner.abort.signal.aborted,
      writer: state.accountStateWriterId === owner.writerId && state.accountStateRevision === owner.revision,
      projection: accountMediaStatesEqual(state.accountMediaState, initialProjection),
      cache: localStorage.getItem(accountStateCacheKey(owner.accountId)) === cacheText,
      writerStorage: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === writerText,
      mediaOwner: state.mediaSession === owner.mediaSession && mediaSourceGeneration === owner.sourceGeneration,
      retirement: q1RetirementResult === owner.retirement && owner.retirement?.settled === true,
      mediaIdle: state.selected === null && state.mediaAttempt === 'idle' && !state.mediaAbortController
        && !state.pendingOriginalBuffer && !state.pendingPlay && !state.mediaTransportStarted && q1Playback === null && !playerMediaPriorityActive,
    };
    lastGuardFailures = Object.keys(checks).filter(key => !checks[key]);
    return lastGuardFailures.length === 0;
  };
  if (!current() || !owner.accountId || !owner.writerId || !cacheText
    || !accountMediaStatesEqual(initialProjection, expectedProjection)) throw new Error('FRESH_CACHE_PREFLIGHT');
  const events = ['pagehide', 'beforeunload'];
  for (const event of events) window.addEventListener(event, abort, { once: true });
  owner.abort.signal.addEventListener('abort', abort, { once: true });
  const cleanup = () => {
    for (const event of events) window.removeEventListener(event, abort);
    owner.abort.signal.removeEventListener('abort', abort);
  };
  let nativeGets = 0;
  const read = (address, options) => {
    if (!current()) throw Object.assign(new Error('stale_owner'), { code: 'stale_owner' });
    const url = new URL(address), keys = [...url.searchParams.keys()].sort().join(',');
    const about = url.pathname === '/drive/v3/about' && keys === 'fields'
      && url.searchParams.get('fields') === 'user(permissionId)';
    const catalog = url.pathname === '/drive/v3/files'
      && ['fields,orderBy,pageSize,q,spaces', 'fields,orderBy,pageSize,pageToken,q,spaces'].includes(keys)
      && url.searchParams.get('spaces') === 'appDataFolder' && url.searchParams.get('pageSize') === '1000'
      && url.searchParams.get('orderBy') === 'modifiedTime desc'
      && url.searchParams.get('fields') === 'nextPageToken,incompleteSearch,files(id,name,modifiedTime)'
      && url.searchParams.get('q') === "(name = 'drive-original-account-state.json' or name contains 'drive-original-account-state-v2-') and trashed = false";
    const body = /^\/drive\/v3\/files\/[A-Za-z0-9_-]{1,200}$/.test(url.pathname)
      && ids.has(url.pathname.split('/').pop()) && keys === 'alt' && url.searchParams.get('alt') === 'media';
    if (url.origin !== 'https://www.googleapis.com' || url.username || url.password || url.hash
      || options?.method !== 'GET' || options.headers || options.body || !options.signal
      || !(about || catalog || body)) throw Object.assign(new Error('invalid_transport'), { code: 'invalid_transport' });
    nativeGets++;
    return fetch(url.href, { method: 'GET', headers: { Authorization: `Bearer ${owner.token}` },
      signal: options.signal, cache: 'no-store', redirect: 'error', credentials: 'omit', priority: 'low' });
  };
  let job;
  try {
    job = this({ read, expectedAccountId: owner.accountId, expectedProjection,
      isCurrent: current, signal: aborter.signal, budgetMs });
  } catch (error) { abort(); cleanup(); throw error; }
  return {
    run: () => job.run().finally(cleanup),
    summary: () => ({ ...job.safeSummary(), nativeGets, ownerCurrent: current(), guardFailures: lastGuardFailures, sourceHash: job.sourceHash,
      actualCacheUnchanged: localStorage.getItem(accountStateCacheKey(owner.accountId)) === cacheText,
      actualWriterUnchanged: localStorage.getItem(ACCOUNT_WRITER_STORAGE_KEY) === writerText }),
    clear: () => { job.clear(); abort(); cleanup(); },
  };
}
