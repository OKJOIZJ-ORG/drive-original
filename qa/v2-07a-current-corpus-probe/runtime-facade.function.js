function (proof, privateContext, mode) {
  if (!['metadata-only-selection', 'bounded-corpus'].includes(mode)) throw new Error('MODE_REJECTED');
  const before = {
    state,
    accountId: state.accountId,
    authAccountKey: state.authAccountKey,
    driveSessionGeneration: state.driveSessionGeneration,
    authGeneration: state.authGeneration,
    tokenRevision: state.tokenRevision,
    mediaSession: state.mediaSession,
    sourceGeneration: mediaSourceGeneration,
    controller: navigator.serviceWorker.controller,
    writerId: state.accountStateWriterId,
    retirement: q1RetirementResult,
  };
  const job = this({
    appVersion: APP_VERSION,
    readState: () => state,
    getSWIdentity: () => proof.get(),
    getMutationsEnabled: () => DRIVE_MUTATIONS_ENABLED,
    navigator,
    location,
    top,
    self,
    nativeFetch: fetch.bind(globalThis),
    hasUsableToken,
    getQ1Playback: () => q1Playback,
    getQ1RetirementResult: () => q1RetirementResult,
    getMediaSourceGeneration: () => mediaSourceGeneration,
    getPlayerMediaPriorityActive: () => playerMediaPriorityActive,
    addEventListener: window.addEventListener.bind(window),
    removeEventListener: window.removeEventListener.bind(window),
    privateContext: privateContext.get(),
  });
  if (mode === 'metadata-only-selection') job.runMetadataOnlySelection();
  else job.run();
  return {
    job,
    poll: () => job.progress(),
    result: () => job.done(),
    owner: () => ({
      accountStable: state === before.state && state.accountId === before.accountId
        && state.authAccountKey === before.authAccountKey
        && state.driveSessionGeneration === before.driveSessionGeneration
        && state.authGeneration === before.authGeneration && state.tokenRevision === before.tokenRevision,
      controllerStable: navigator.serviceWorker.controller === before.controller,
      mediaOwnerStable: state.mediaSession === before.mediaSession
        && mediaSourceGeneration === before.sourceGeneration && q1RetirementResult === before.retirement,
      idle: state.selected === null && state.mediaAttempt === 'idle'
        && state.mediaAbortController === null && state.pendingOriginalBuffer === null
        && state.pendingPlay === false && state.mediaTransportStarted === false
        && q1Playback === null && q1RetirementResult?.settled === true && !playerMediaPriorityActive,
      readOnly: DRIVE_MUTATIONS_ENABLED === false,
      writerEqual: state.accountStateWriterId === before.writerId,
    }),
  };
}
