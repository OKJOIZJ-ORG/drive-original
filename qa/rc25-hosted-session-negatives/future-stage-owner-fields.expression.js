(approvedOrigin => ((function(config) { return ((function createFutureStageDiagnostic(config) {
  const { approvedOrigin, getOwner, fetchImpl = fetch, runtimeOrigin = location.origin,
    now = Date.now, elapsedNow = () => performance.now(), setTimer = setTimeout,
    clearTimer = clearTimeout, createExtended } = config;
  const version = '1.22.0-rc.25', safeNames = new Set(['AbortError', 'TimeoutError', 'TypeError', 'SyntaxError', 'Error']);
  const same = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
  const eligible = initial => runtimeOrigin === approvedOrigin && /^https:\/\//.test(approvedOrigin)
    && new URL(approvedOrigin).origin === approvedOrigin && initial.version === version
    && initial.authenticated && !initial.busy && initial.expiresAt - now() >= 120000
    && Number.isSafeInteger(initial.revision) && initial.revision < Number.MAX_SAFE_INTEGER - 1000000
    && initial.online && initial.visible && initial.account !== 'qa-negative-account';
  let running = false, admittedOwner = null, admittedAt = 0;
  async function runDiagnostic() {
    const result = { schema: 'drive-original.rc25-future-stage-owner-fields/1', version,
      requestCapMs: 10000, bodyCapBytes: 4096, complete: false, requests: 0,
      stage: 'precondition', status: null, headerElapsedMs: null, bodyElapsedMs: null,
      totalElapsedMs: 0, receivedBodyBytes: 0, errorName: null, errorCode: null,
      errorSchema: false, headerContract: false, ownerPreserved: true, ownerMismatchFields: [],
      cookieHeaderDirectlyObservable: false, hostedOriginMismatchVerified: false,
      extendedEligible: false };
    if (running) return { ...result, failure: 'already-running' };
    admittedOwner = null;
    const initial = getOwner();
    if (!eligible(initial)) return { ...result, failure: 'precondition' };
    running = true;
    const started = elapsedNow(), abort = new AbortController();
    let timer, reader, bodyStarted = null, finished = false;
    const ownerStill = () => { const observed = getOwner(); const names = ["version","authenticated","account","token","revision","expiresAt","authGeneration","accountGeneration","authStatus","capabilities","data","loaded","identityPending","busy","credentialFlight","renewalTimer","controller","sourceGeneration","selected","mediaSession","playbackOwner","visible","online","credentialBusy","readBusy","writeBusy","writeScheduled"].filter(k => initial[k] !== observed[k]); result.ownerMismatchFields = [...new Set([...result.ownerMismatchFields, ...names])]; return same(initial, observed); };
    const duration = start => Math.max(0, Math.round((elapsedNow() - start) * 1000) / 1000);
    try {
      result.requests = 1; result.stage = 'headers';
      const operation = (async () => {
        const response = await fetchImpl(approvedOrigin + '/api/session/credential', {
          method: 'POST', mode: 'same-origin', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
          headers: { 'Content-Type': 'application/json', 'X-Drive-Original-CSRF': '1' },
          body: '{"credentialProtocol":2,"rejectedRevision":9007199254740991}', signal: abort.signal
        });
        if (finished || abort.signal.aborted) { Promise.resolve(response.body?.cancel()).catch(() => {}); throw new DOMException('cancelled', 'AbortError'); }
        result.status = Number.isInteger(response.status) ? response.status : null;
        result.headerElapsedMs = duration(started);
        result.headerContract = response.headers.get('Cache-Control') === 'no-store'
          && response.headers.get('Pragma') === 'no-cache'
          && response.headers.get('Content-Type') === 'application/json; charset=utf-8'
          && response.headers.get('X-Content-Type-Options') === 'nosniff'
          && response.headers.get('Access-Control-Allow-Origin') === null;
        if (!ownerStill()) { result.ownerPreserved = false; throw new Error('owner-changed'); }
        if (response.status !== 409) { Promise.resolve(response.body?.cancel()).catch(() => {}); throw new Error('unexpected-status'); }
        result.stage = 'body'; bodyStarted = elapsedNow();
        reader = response.body?.getReader(); if (!reader) throw new Error('missing-body');
        const decoder = new TextDecoder(); let text = '';
        for (;;) {
          const part = await reader.read();
          if (finished || abort.signal.aborted) throw new DOMException('cancelled', 'AbortError');
          if (!ownerStill()) { result.ownerPreserved = false; throw new Error('owner-changed'); }
          if (part.done) break;
          result.receivedBodyBytes += part.value.byteLength;
          if (result.receivedBodyBytes > 4096) { Promise.resolve(reader.cancel()).catch(() => {}); throw new Error('body-cap'); }
          text += decoder.decode(part.value, { stream: true });
        }
        text += decoder.decode(); result.bodyElapsedMs = duration(bodyStarted); result.stage = 'parse';
        const payload = JSON.parse(text);
        result.errorCode = payload?.error?.code === 'stale_revision' ? 'stale_revision' : null;
        result.errorSchema = Boolean(payload && Object.keys(payload).join() === 'error' && payload.error
          && Object.keys(payload.error).sort().join() === 'code,retryable' && payload.error.retryable === false);
        if (!result.errorSchema || result.errorCode !== 'stale_revision' || !result.headerContract) throw new Error('rejection-contract');
      })();
      const deadline = new Promise((_, reject) => { timer = setTimer(() => { abort.abort(); reject(new DOMException('deadline', 'TimeoutError')); }, 10000); });
      await Promise.race([operation, deadline]);
      result.ownerPreserved = ownerStill(); result.complete = result.ownerPreserved;
      result.stage = result.complete ? 'done' : 'owner-changed';
    } catch (error) {
      result.errorName = safeNames.has(error?.name) ? error.name : 'unknown';
      result.failure = result.ownerPreserved && ownerStill() ? 'request-or-body-failure' : 'owner-changed';
      result.ownerPreserved = result.ownerPreserved && ownerStill();
    } finally {
      finished = true; clearTimer(timer); abort.abort();
      if (bodyStarted !== null && result.bodyElapsedMs === null) result.bodyElapsedMs = duration(bodyStarted);
      result.totalElapsedMs = duration(started);
      try { reader?.releaseLock(); } catch {}
      running = false;
    }
    result.extendedEligible = result.complete && result.ownerPreserved && result.status === 409
      && result.errorCode === 'stale_revision' && result.totalElapsedMs < 10000;
    if (result.extendedEligible) { admittedOwner = initial; admittedAt = now(); }
    return JSON.parse(JSON.stringify(result));
  }
  function extended() {
    if (running || !admittedOwner || now() - admittedAt > 60000 || !same(admittedOwner, getOwner())) return null;
    const owner = admittedOwner; admittedOwner = null;
    const harness = createExtended(config);
    return Object.freeze({ run() {
      if (!same(owner, getOwner())) return Promise.resolve({ complete: false, stopped: 'owner-changed', requests: 0 });
      return harness.run();
    } });
  }
  return Object.freeze({ runDiagnostic, extended });
})
)({ ...config, createExtended: config => (// Browser-local factory. No token/cookie/account values enter its result.
(function createSessionNegativeHarness({ approvedOrigin, getOwner, fetchImpl = fetch,
  runtimeOrigin = location.origin, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const version = '1.22.0-rc.25';
  const codes = new Set(['forbidden', 'bad_request', 'unauthorized', 'account_mismatch', 'stale_revision', 'client_update_required']);
  const unchanged = (a, b) => Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
  let running = false;
  async function run() {
    const result = { schema: 'drive-original.rc25-hosted-session-negatives-owner-fields/1', version,
      scope: 'existing-session rejection probes; no live execution implied', cases: [], complete: false,
      ownerPreserved: true, ownerMismatchFields: [], sessionAcceptedBefore: false, sessionAcceptedAfter: false,
      cookieHeaderDirectlyObservable: false, hostedOriginMismatchVerified: false };
    if (running) return { ...result, stopped: 'already-running' };
    const initial = getOwner();
    if (runtimeOrigin !== approvedOrigin || !/^https:\/\//.test(approvedOrigin)
      || new URL(approvedOrigin).origin !== approvedOrigin || initial.version !== version
      || !initial.authenticated || initial.busy || initial.expiresAt - now() < 120000
      || !Number.isSafeInteger(initial.revision) || initial.revision >= Number.MAX_SAFE_INTEGER - 1000000
      || !initial.online || !initial.visible) return { ...result, stopped: 'precondition' };
    running = true;
    const foreignAccount = 'qa-negative-account';
    if (initial.account === foreignAccount) { running = false; return { ...result, stopped: 'precondition' }; }
    const guard = { credentialProtocol: 999 };
    const cases = [
      ['session-before', guard, 409, 'client_update_required'],
      ['expected-account-mismatch', { credentialProtocol: 2, expectedAccount: foreignAccount }, 409, 'account_mismatch'],
      ['future-revision', { credentialProtocol: 2, rejectedRevision: Number.MAX_SAFE_INTEGER }, 409, 'stale_revision'],
      ['invalid-revision', { credentialProtocol: 2, rejectedRevision: -1 }, 400, 'bad_request'],
      ['unknown-field', { ...guard, qaUnknown: true }, 400, 'bad_request'],
      ['malformed-json', '{', 400, 'bad_request'],
      ['query-rejected', guard, 400, 'bad_request', { query: '?qa=negative' }],
      ['missing-csrf', guard, 403, 'forbidden', { csrf: null }],
      ['wrong-csrf', guard, 403, 'forbidden', { csrf: 'wrong' }],
      ['omitted-session', guard, 401, 'unauthorized', { credentials: 'omit' }],
      ['session-after', { credentialProtocol: 2, rejectedRevision: Number.MAX_SAFE_INTEGER }, 409, 'stale_revision']
    ];
    const start = now();
    const ownerStill = () => { const observed = getOwner(); const names = ["version","authenticated","account","token","revision","expiresAt","authGeneration","accountGeneration","authStatus","capabilities","data","loaded","identityPending","busy","credentialFlight","renewalTimer","controller","sourceGeneration","selected","mediaSession","playbackOwner","visible","online","credentialBusy","readBusy","writeBusy","writeScheduled"].filter(k => initial[k] !== observed[k]); result.ownerMismatchFields = [...new Set([...result.ownerMismatchFields, ...names])]; return unchanged(initial, observed); };
    try {
      for (const [name, body, status, code, options = {}] of cases) {
        if (!ownerStill()) { result.ownerPreserved = false; result.stopped = 'owner-changed'; break; }
        if (now() - start >= 60000) { result.stopped = 'total-deadline'; break; }
        const abort = new AbortController();
        let timer;
        try {
          const headers = { 'Content-Type': 'application/json' };
          if (options.csrf !== null) headers['X-Drive-Original-CSRF'] = options.csrf || '1';
          const operation = (async () => {
            const response = await fetchImpl(approvedOrigin + '/api/session/credential' + (options.query || ''), {
              method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
              credentials: options.credentials || 'same-origin', cache: 'no-store', redirect: 'error',
              mode: 'same-origin', signal: abort.signal
            });
            // Never parse a successful credential payload or install a credential.
            if (response.status !== status) { await response.body?.cancel(); return { name, status: response.status, passed: false, failure: 'unexpected-status' }; }
            const reader = response.body?.getReader();
            if (!reader) throw new Error('safe-body-failure');
            let text = '', bytes = 0;
            const decoder = new TextDecoder();
            try {
              for (;;) {
                const part = await reader.read();
                if (part.done) break;
                bytes += part.value.byteLength;
                if (bytes > 4096) { await reader.cancel(); throw new Error('safe-body-failure'); }
                text += decoder.decode(part.value, { stream: true });
              }
              text += decoder.decode();
            } finally { reader.releaseLock(); }
            const payload = JSON.parse(text);
            const errorCode = codes.has(payload?.error?.code) ? payload.error.code : null;
            const schema = payload && Object.keys(payload).join() === 'error' && payload.error
              && Object.keys(payload.error).sort().join() === 'code,retryable' && payload.error.retryable === false;
            const headerContract = response.headers.get('Cache-Control') === 'no-store'
              && response.headers.get('Pragma') === 'no-cache'
              && response.headers.get('Content-Type') === 'application/json; charset=utf-8'
              && response.headers.get('X-Content-Type-Options') === 'nosniff'
              && response.headers.get('Access-Control-Allow-Origin') === null;
            return { name, status: response.status, errorCode, errorSchema: Boolean(schema), headerContract,
              passed: Boolean(schema && headerContract && errorCode === code) };
          })();
          const deadline = new Promise((_, reject) => { timer = setTimer(() => { abort.abort(); reject(new Error('safe-deadline')); }, Math.min(10000, 60000 - (now() - start))); });
          const observed = await Promise.race([operation, deadline]);
          result.cases.push(observed);
          if (!ownerStill()) { result.ownerPreserved = false; result.stopped = 'owner-changed'; break; }
          if (!observed.passed) { result.stopped = 'rejection-contract'; break; }
          if (name === 'session-before') result.sessionAcceptedBefore = true;
          if (name === 'session-after') result.sessionAcceptedAfter = true;
        } catch {
          result.cases.push({ name, passed: false, failure: 'request-or-body-failure' });
          result.stopped = 'request-or-body-failure';
          break;
        } finally { clearTimer(timer); }
      }
      result.ownerPreserved = result.ownerPreserved && ownerStill();
      result.complete = result.cases.length === cases.length && result.cases.every(c => c.passed)
        && result.ownerPreserved && result.sessionAcceptedBefore && result.sessionAcceptedAfter;
      return result;
    } finally { running = false; }
  }
  return Object.freeze({ run });
})
)(config) }); }))({ approvedOrigin, getOwner: () => ({
 version: APP_VERSION, authenticated: hasUsableToken() && Boolean(state.authAccountKey),
 account: state.authAccountKey, token: state.token, revision: state.tokenRevision,
 expiresAt: state.expiresAt, authGeneration: state.authGeneration,
 accountGeneration: state.driveSessionGeneration, authStatus: state.authStatus,
 capabilities: JSON.stringify(state.authCapabilities), data: JSON.stringify(state.accountMediaState),
 loaded: state.accountStateLoaded, identityPending: state.accountIdentityPending,
 busy: Boolean(credentialRequestPromise || state.accountStateLoadingPromise || state.accountStateSyncPromise || state.accountStateSyncTimer || state.accountStateSyncRetryTimer),
 credentialFlight: credentialRequestOutcome, renewalTimer: tokenRenewalTimer,
 credentialBusy: Boolean(credentialRequestPromise), readBusy: Boolean(state.accountStateLoadingPromise),
 writeBusy: Boolean(state.accountStateSyncPromise), writeScheduled: Boolean(state.accountStateSyncTimer || state.accountStateSyncRetryTimer),
 controller: navigator.serviceWorker?.controller, sourceGeneration: mediaSourceGeneration,
 selected: state.selected?.id, mediaSession: state.mediaSession, playbackOwner: q1Playback,
 visible: document.visibilityState === 'visible', online: navigator.onLine
}) }))
