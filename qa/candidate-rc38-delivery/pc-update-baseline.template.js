(async function () {
  'use strict';
  const key = 'drive-original.qa.rc38-update-baseline';
  if (APP_VERSION !== '1.22.0-rc.37' || state.selected || q0Playback || q1Playback
      || q1RetirementResult?.settled !== true || state.authStatus !== 'online'
      || (typeof playerTracksOwner!=='undefined'&&playerTracksOwner) || !state.accountStateLoaded || !hasUsableToken()
      || document.visibilityState !== 'visible' || window.__qaRc38PcUpdate
      || localStorage.getItem(key) || window.__resumeSwProof || window.__qaRc35PcUpdate || state.accountStateSyncPromise || state.accountStateSyncTimer || state.accountStateSyncRetryTimer || state.accountStateLoadingPromise || state.accountIdentityPending) throw Error('QA_UPDATE_BASELINE_PREFLIGHT');
  const account = state.accountId, accountKey = state.authAccountKey;
  const writer = state.accountStateWriterId, auth = state.authGeneration;
  const data = state.driveSessionGeneration, controller = navigator.serviceWorker.controller;
  const snapshot = [account, accountKey, writer, state.accountMediaState,
    localStorage.getItem(accountStateCacheKey(account))].map(x => JSON.stringify(x));
  const hash = async value => Array.from(new Uint8Array(await crypto.subtle.digest(
    'SHA-256', new TextEncoder().encode(value))), x => x.toString(16).padStart(2, '0')).join('');
  const hashes = await Promise.all(snapshot.map(hash));
  const same = () => APP_VERSION === '1.22.0-rc.37' && state.accountId === account
    && state.authAccountKey === accountKey && state.accountStateWriterId === writer
    && state.authGeneration === auth && state.driveSessionGeneration === data
    && navigator.serviceWorker.controller === controller && state.authStatus === 'online'
    && state.accountStateLoaded && hasUsableToken();
  if (!same() || snapshot.some((x, i) => x !== [state.accountId, state.authAccountKey,
    state.accountStateWriterId, state.accountMediaState,
    localStorage.getItem(accountStateCacheKey(account))].map(v => JSON.stringify(v))[i]))
    throw Error('QA_UPDATE_BASELINE_DRIFT');
  const row = { beforeVersion: APP_VERSION, recordedAt: Date.now(),
    account: hashes[0], accountKey: hashes[1], writer: hashes[2],
    projection: hashes[3], cache: hashes[4], clickedAt: null, pagehideAt: null };
  const save = () => localStorage.setItem(key, JSON.stringify(row));
  const click = event => {
    if (event.isTrusted && same() && event.target?.closest?.('#bannerUpdateButton,#applyUpdateButton')) {
      row.clickedAt = Date.now(); save();
    }
  };
  const hide = event => {
    if (event.isTrusted && row.clickedAt) { row.pagehideAt = Date.now(); save(); }
  };
  save();
  document.addEventListener('click', click, true);
  window.addEventListener('pagehide', hide);
  window.__qaRc38PcUpdate = Object.freeze({ stop: () => {
    document.removeEventListener('click', click, true);
    window.removeEventListener('pagehide', hide);
    localStorage.removeItem(key); delete window.__qaRc38PcUpdate;
    return { ownedBaselineRemoved: true, ownedListenersRemoved: true };
  } });
  return { beforeVersion: APP_VERSION, hashedAccountWriterProjectionCacheSaved: true,
    normalTrustedUpdateClickRequired: true, rawIdentifiersExported: false };
})()
