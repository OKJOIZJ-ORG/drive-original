// In-memory alternative only. This file is never materialized into public assets.
let credentialRenewalRetryable = false;
async function fetchCredentialWithRetry(url, init) {
  const delays = [1_250, 2_500];
  credentialRenewalRetryable = true; // Abort at the existing operation deadline is transient.
  for (let attempt = 0; ; attempt++) {
    init.signal.throwIfAborted();
    let response, failure;
    try { response = await fetch(url, init); }
    catch (error) { failure = error; }
    if (failure?.name === 'AbortError') throw failure;
    const transientPayload = response?.status === 503 ? await readAuthJson(response.clone()) : null;
    const transient = failure?.name === 'TypeError'
      || (response?.status === 503 && authErrorCode(transientPayload) === 'auth_unavailable');
    credentialRenewalRetryable = transient;
    if (!transient || attempt >= delays.length || !navigator.onLine) {
      if (failure) throw failure;
      return response;
    }
    // Retry is scoped to auth POST. No Drive read/mutation replay is added.
    void response?.body?.cancel()?.catch(() => {});
    await new Promise((resolve, reject) => {
      let timer;
      const finish = error => {
        clearTimeout(timer); init.signal.removeEventListener('abort', abort);
        error ? reject(error) : resolve();
      };
      const abort = () => finish(init.signal.reason || new DOMException('Aborted', 'AbortError'));
      init.signal.addEventListener('abort', abort, { once: true });
      timer = setTimeout(() => finish(), delays[attempt]);
      if (init.signal.aborted) abort();
    });
  }
}
scheduleTokenRenewal = function scheduleTokenRenewalPrototype() {
  if (tokenRenewalTimer) clearTimeout(tokenRenewalTimer);
  tokenRenewalTimer = null;
  if (!state.token || !state.expiresAt) return;
  const generation = state.authGeneration, account = state.authAccountKey;
  const revision = state.tokenRevision, expiresAt = state.expiresAt;
  const current = () => generation === state.authGeneration && account === state.authAccountKey
    && revision === state.tokenRevision && expiresAt === state.expiresAt && Boolean(state.token);
  const schedule = (delay, retry = false) => {
    const timer = setTimeout(async () => {
      if (tokenRenewalTimer !== timer) return;
      tokenRenewalTimer = null;
      if (!current() || (retry && (!navigator.onLine || document.visibilityState === 'hidden'))) return;
      const refreshed = await requestSessionCredential({ background: true, force: true, rejectedRevision: revision });
      if (refreshed || !current() || !credentialRenewalRetryable || tokenRenewalTimer !== null
        || !navigator.onLine || document.visibilityState === 'hidden') return;
      // A visible online long outage retains one owner at a bounded rate.
      schedule(15_000, true);
    }, delay);
    tokenRenewalTimer = timer;
  };
  schedule(Math.max(1_000, expiresAt - Date.now() - TOKEN_SKEW_MS - AUTH_CREDENTIAL_TIMEOUT_MS - 5_000));
};
