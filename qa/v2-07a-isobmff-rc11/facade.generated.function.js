function (privateContextText, swProof) {
  'use strict';
  const rejected = () => Object.freeze({
    poll: () => ({ done: true, scope: 'rc11-first-iso-headers', failure: 'FACADE_PREFLIGHT_REJECTED', mediaRequests: 0, writeRequests: 0 }),
    cancel: () => ({ cancelled: true }),
  });
  let context, projection;
  try {
    if (typeof privateContextText !== 'string' || privateContextText.length > 4096) return rejected();
    context = JSON.parse(privateContextText);
    if (!context || Array.isArray(context) || Object.keys(context).sort().join(',') !== 'accountKey,generation,priorityFileId,rootId'
      || !['accountKey', 'priorityFileId', 'rootId'].every(key => typeof context[key] === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(context[key]))
      || !Number.isSafeInteger(context.generation) || context.generation < 0) return rejected();
    projection = JSON.parse(JSON.stringify(state.accountMediaState));
  } catch { return rejected(); }
  let owner = {
    account: state.accountId, key: state.authAccountKey, auth: state.authGeneration,
    drive: state.driveSessionGeneration, tokenRevision: state.tokenRevision,
    token: state.token, expiry: state.expiresAt, abort: state.accountStateAbortController,
    controller: navigator.serviceWorker.controller, writer: state.accountStateWriterId,
    revision: state.accountStateRevision, session: state.mediaSession,
    source: mediaSourceGeneration, retirement: q1RetirementResult,
  };
  const current = () => Boolean(owner) && APP_VERSION === '1.22.0-rc.11' && DRIVE_MUTATIONS_ENABLED === false
    && ACCOUNT_STATE_WRITES_ENABLED === true && top === self && navigator.onLine === true
    && document.visibilityState === 'visible'
    && location.origin === 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev'
    && state.accountId === owner.account && state.authAccountKey === owner.key
    && state.authGeneration === owner.auth && state.driveSessionGeneration === owner.drive
    && state.tokenRevision === owner.tokenRevision && state.token === owner.token && state.expiresAt === owner.expiry
    && state.authStatus === 'online' && state.demo === false && !state.accountIdentityPending && hasUsableToken()
    && state.accountStateAbortController === owner.abort && Boolean(owner.abort?.signal) && !owner.abort.signal.aborted
    && navigator.serviceWorker.controller === owner.controller && owner.controller?.state === 'activated'
    && state.accountStateLoaded === true && state.accountStateWriterId === owner.writer
    && typeof owner.writer === 'string' && owner.writer.length > 0
    && Number.isSafeInteger(owner.revision) && owner.revision >= 0 && state.accountStateRevision === owner.revision
    && state.accountStateSyncPromise === null && state.accountStateSyncTimer === null
    && state.accountStateSyncRetryTimer === null && state.accountStateSyncError === null
    && accountMediaStatesEqual(state.accountMediaState, projection)
    && state.mediaSession === owner.session && mediaSourceGeneration === owner.source
    && q1RetirementResult === owner.retirement && q1RetirementResult?.settled === true
    && state.selected === null && state.mediaAttempt === 'idle' && state.mediaAbortController === null
    && state.pendingOriginalBuffer === null && state.pendingPlay === false && state.mediaTransportStarted === false
    && q1Playback === null && !playerMediaPriorityActive;
  let handle;
  try {
    if (!current() || context.accountKey !== owner.account || context.generation !== owner.drive) return rejected();
    handle = this({ appVersion: APP_VERSION,
      readState: () => { if (!current()) throw new Error('OWNER_CHANGED'); return state; },
      hasUsableToken, getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,
      getSWIdentity: () => swProof?.get?.(), getQ1Playback: () => q1Playback,
      getQ1RetirementResult: () => q1RetirementResult, getMediaSourceGeneration: () => mediaSourceGeneration,
      getPlayerMediaPriorityActive: () => playerMediaPriorityActive,
      navigator, location, top, self, privateContext: context,
      nativeFetch: (...args) => { if (!current()) throw new Error('OWNER_CHANGED'); return fetch(...args); },
      addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    });
  } catch { context = null; projection = null; return rejected(); }
  let settled = false;
  // Deliberately do not return or expose this Promise: CDP receives a handle immediately.
  handle.run().then(() => { settled = true; projection = null; context = null; owner = null; }, () => {
    settled = true; projection = null; context = null; owner = null;
  });
  return Object.freeze({
    poll: () => ({ scope: 'rc11-first-iso-headers', normalEqualReadRefreshAllowed: true,
      ...handle.progress(),
      done: settled && handle.done().done, summary: settled ? handle.done().summary : null }),
    cancel: () => handle.cancel(),
  });
}
