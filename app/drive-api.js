'use strict';

// Drive request ownership, retry and credential refresh.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function parseRetryAfterMs(value, now = Date.now()) {
  const raw = String(value || '').trim();
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) {
    const milliseconds = Number(raw) * 1000;
    return Number.isSafeInteger(milliseconds) ? milliseconds : Number.MAX_SAFE_INTEGER;
  }
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) return 0;
  return Math.max(0, timestamp - now);
}

function waitForRetry(delayMs, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Request aborted', 'AbortError'));
      return;
    }
    const deadline = Date.now() + Math.max(0, Number(delayMs) || 0);
    let timer;
    const cleanup = () => signal?.removeEventListener('abort', abort);
    const abort = () => {
      clearTimeout(timer);
      cleanup();
      reject(new DOMException('Request aborted', 'AbortError'));
    };
    const tick = () => {
      const remaining = deadline - Date.now();
      if (remaining > 0) timer = setTimeout(tick, Math.min(remaining, MAX_ORIGINAL_RETRY_AFTER_MS));
      else { cleanup(); resolve(); }
    };
    signal?.addEventListener('abort', abort, { once: true });
    tick();
  });
}

function assertDriveRequestOwner(generation, signal, dataGeneration = state.driveSessionGeneration) {
  if (signal?.aborted || generation !== state.authGeneration || dataGeneration !== state.driveSessionGeneration) {
    throw new DOMException('Drive request belongs to a closed account session', 'AbortError');
  }
}

function requestDriveCredential(options, signal) {
  if (signal?.aborted) return Promise.reject(new DOMException('Drive request cancelled', 'AbortError'));
  const pending = requestSessionCredential(options);
  if (!signal) return pending;
  // A media consumer can leave without cancelling the shared account refresh.
  // Settle its callback promptly so a closed source can prove its cleanup.
  return new Promise((resolve, reject) => {
    const cleanup = () => signal.removeEventListener('abort', abort);
    const abort = () => { cleanup(); reject(new DOMException('Drive request cancelled', 'AbortError')); };
    signal.addEventListener('abort', abort, { once: true });
    pending.then(value => { cleanup(); resolve(value); }, error => { cleanup(); reject(error); });
    if (signal.aborted) abort();
  });
}

async function driveFetch(url, options = {}, _retried = false, _rateAttempt = 0, generation = state.authGeneration, dataGeneration = state.driveSessionGeneration) {
  const assertOwner = () => assertDriveRequestOwner(generation, options.signal, dataGeneration);
  assertOwner();
  const maxRateAttempts = Math.max(1, Math.min(3, Number(options.driveMaxRateAttempts) || 3));
  const requestOptions = { ...options };
  delete requestOptions.driveMaxRateAttempts;
  delete requestOptions.driveNoRetry;
  const accountStateRead = requestOptions[ACCOUNT_STATE_READ] === true;
  delete requestOptions[ACCOUNT_STATE_READ];
  const accountStateResponse = requestOptions[ACCOUNT_STATE_READ_RESPONSE];
  delete requestOptions[ACCOUNT_STATE_READ_RESPONSE];
  const accountStateWrite = requestOptions[ACCOUNT_STATE_WRITE];
  delete requestOptions[ACCOUNT_STATE_WRITE];
  const disposablePermit = requestOptions[DISPOSABLE_DRIVE_MUTATION];
  delete requestOptions[DISPOSABLE_DRIVE_MUTATION];
  const requestMethod = String(requestOptions.method || 'GET').toUpperCase();
  const stateWriteAllowed = isAccountStateWriteRequest(url, requestMethod, accountStateWrite);
  const disposableWriteAllowed = disposablePermit !== undefined
    && disposableDriveMutations.consume(disposablePermit, url, options);
  if (!DRIVE_MUTATIONS_ENABLED && !['GET', 'HEAD'].includes(requestMethod) && !stateWriteAllowed && !disposableWriteAllowed) {
    const error = new Error('Candidate Drive mutations are disabled until state verification completes.');
    error.code = 'candidate_read_only';
    error.status = 423;
    throw error;
  }
  if (!hasUsableToken()) {
    if (disposableWriteAllowed) throw driveMutationError('failed', '일회용 검증 권한이 만료되었습니다.', 401);
    if (!_retried) {
      await requestDriveCredential({ background: true, force: true }, options.signal);
      assertOwner();
      if (hasUsableToken()) return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
    }
    const error = new Error('Google 인증이 만료되었습니다.');
    error.status = 401;
    throw error;
  }
  const aboutRequest = new URL(url, location.href).pathname === '/drive/v3/about' && requestMethod === 'GET';
  const feature = accountStateWrite || accountStateRead ? 'appData' : ['GET', 'HEAD'].includes(requestMethod) ? 'driveRead' : 'driveWrite';
  if (!(aboutRequest && (hasAuthCapability('driveRead') || hasAuthCapability('appData'))) && !hasAuthCapability(feature)) throw missingScopeError(feature);
  const requestToken = state.token;
  const requestTokenRevision = state.tokenRevision || 0;
  const response = await fetch(url, {
    ...requestOptions,
    ...(disposableWriteAllowed ? { redirect: 'error', credentials: 'omit' } : {}),
    cache: 'no-store',
    headers: { ...(requestOptions.headers || {}), Authorization: `Bearer ${state.token}` }
  });
  if (accountStateRead && requestMethod === 'GET') accountStateResponse?.(response);
  try { assertOwner(); } catch (error) {
    response.body?.cancel().catch(() => {});
    throw error;
  }
  if (!response.ok) {
    let body = null;
    try {
      body = await response.json();
    } catch (_) {}
    assertOwner();
    if (response.status === 401 && !_retried && !options.driveNoRetry) {
      // A concurrent request may already have replaced the rejected token.
      if (((state.tokenRevision || 0) !== requestTokenRevision || state.token !== requestToken) && hasUsableToken()) {
        return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
      }
      const refreshed = await requestDriveCredential({
        background: true,
        force: true,
        rejectedRevision: requestTokenRevision
      }, options.signal);
      assertOwner();
      if (refreshed && hasUsableToken()) return driveFetch(url, options, true, _rateAttempt, generation, dataGeneration);
      if ((state.tokenRevision || 0) === requestTokenRevision && state.token === requestToken) clearToken(true);
    }
    const reasons = (body?.error?.errors || []).map((item) => item?.reason).filter(Boolean);
    const rateLimited = response.status === 429
      || (response.status === 403 && reasons.some((reason) => /rateLimitExceeded/i.test(reason)));
    if (rateLimited && !options.driveNoRetry && _rateAttempt < maxRateAttempts - 1) {
      const retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
      const delayMs = retryAfterMs || 500 * (2 ** _rateAttempt) + Math.floor(Math.random() * 250);
      await waitForRetry(delayMs, options.signal);
      return driveFetch(url, options, _retried, _rateAttempt + 1, generation, dataGeneration);
    }
    const detail = body?.error?.message || response.statusText || '';
    const error = new Error(detail || `Drive API ${response.status}`);
    error.status = response.status;
    error.rejectedTokenRevision = requestTokenRevision;
    error.rejectedAccountGeneration = dataGeneration;
    error.reasons = reasons;
    error.driveReason = reasons[0] || '';
    error.retryAfterMs = parseRetryAfterMs(response.headers.get('Retry-After'));
    throw error;
  }
  // Metadata consumers may still be awaiting JSON after headers arrive. Guard
  // that final async boundary as well, without buffering any media stream.
  const readJson = response.json.bind(response);
  response.json = async () => {
    assertOwner();
    const data = await readJson();
    assertOwner();
    return data;
  };
  return response;
}

