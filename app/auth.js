'use strict';

// Service worker messages, session credentials and standalone authorization.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

async function handleWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'Q0_OWNER_REQUEST' || data.type === 'Q0_PIN_REQUEST') {
    handleQ0PinMessage(event, data);
    return;
  }
  if (data.type === 'TOKEN_REQUEST' && event.ports && event.ports[0]) {
    const port = event.ports[0];
    const requestGeneration = Number(data.accountGeneration);
    const mediaMatches = () => data.requireCurrentMedia !== true || (data.mediaOwner === 'q0' ? Boolean(
      data.q0PinProtocol === globalThis.DriveRevisionPin?.PROTOCOL
      && event.source === q0Playback?.swController
      && navigator.serviceWorker?.controller === q0Playback?.swController
      && isCurrentQ0Playback(q0Playback, data.fileId, data.sourceGeneration)
      && String(q0Playback.session) === data.mediaSession
    ) : Boolean(
      q1Playback && !q1Playback.controller.signal.aborted && state.mediaAttempt.startsWith('q1')
      && event.source === q1Playback.swController
      && navigator.serviceWorker?.controller === q1Playback.swController
      && state.selected?.id === data.fileId && String(state.mediaSession) === data.mediaSession
      && Number.isSafeInteger(data.sourceGeneration) && data.sourceGeneration === mediaSourceGeneration
    ));
    const accountMatches = !data.expectedAccount || data.expectedAccount === state.authAccountKey;
    const generationMatches = Number.isInteger(requestGeneration)
      && requestGeneration === state.driveSessionGeneration;
    let available = generationMatches && accountMatches && mediaMatches() && hasUsableToken();
    if (generationMatches && accountMatches && mediaMatches() && (!available || data.forceRefresh)) {
      available = await requestSessionCredential({
        background: true,
        force: true,
        rejectedRevision: data.forceRefresh && Number.isSafeInteger(data.rejectedRevision)
          ? data.rejectedRevision
          : null
      });
    }
    const stillCurrent = generationMatches
      && requestGeneration === state.driveSessionGeneration
      && accountMatches
      && (!data.expectedAccount || data.expectedAccount === state.authAccountKey)
      && mediaMatches();
    const granted = available && stillCurrent && hasUsableToken() && hasAuthCapability('driveRead');
    port.postMessage({
      type: 'TOKEN_RESPONSE',
      requestId: data.requestId,
      requestCurrent: stillCurrent,
      q1RetirementProtocol: data.requireCurrentMedia === true ? Q1_RETIRE_PROTOCOL : undefined,
      q0PinProtocol: data.mediaOwner === 'q0' ? globalThis.DriveRevisionPin?.PROTOCOL : undefined,
      credentialProtocol: AUTH_PROTOCOL,
      token: granted ? state.token : null,
      expiresAt: granted ? state.expiresAt : 0,
      account: granted ? state.authAccountKey : null,
      revision: granted ? state.tokenRevision : 0,
      accountGeneration: state.driveSessionGeneration
    });
    port.close?.();
    return;
  }
  if (data.type === 'MEDIA_TRACE_EVENT') {
    forwardWorkerMediaDiagnostic(data);
    return;
  }
  if (data.type === 'MEDIA_PROXY_STATUS') {
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (data.fileId && data.fileId !== state.selected?.id) return;
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    if (messageSourceGeneration != null && (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    )) return;
    if (
      !state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)
      || state.mediaPlaybackMode === PLAYBACK_MODE.COMPATIBILITY
    ) return;
    const requestedRange = String(data.requestedRange || '');
    const contentRange = String(data.contentRange || '');
    const rangeSatisfied = data.rangeSatisfied === true;
    const status = Number(data.status) || 0;
    if (data.playbackMode === PLAYBACK_MODE.SEQUENTIAL || (requestedRange && status === 200)) {
      state.mediaPlaybackMode = PLAYBACK_MODE.SEQUENTIAL;
      state.mediaRangeIntegrity = 'sequential';
      state.mediaTransportVerified = true;
    } else if (data.playbackMode === PLAYBACK_MODE.RANGE || (status === 206 && rangeSatisfied && contentRange)) {
      state.mediaPlaybackMode = PLAYBACK_MODE.RANGE;
      state.mediaRangeIntegrity = 'valid';
      state.mediaTransportVerified = true;
    }
    if (state.mediaTransportVerified && el.codecNote) {
      el.codecNote.textContent = state.mediaPlaybackMode === PLAYBACK_MODE.SEQUENTIAL
        ? 'Google Drive 원본 파일 바이트를 재인코딩 없이 연속 전송 중입니다.'
        : 'Google Drive 원본 파일 바이트를 Range로 재인코딩 없이 전송 중입니다.';
    }
    state.lastProxyError = null;
    updateQualityDisplay();
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    return;
  }
  if (data.type === 'MEDIA_PROXY_PROGRESS') {
    if (data.stage !== 'first-byte') return;
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (data.fileId && data.fileId !== state.selected?.id) return;
    if (!Number.isFinite(messageSession) || messageSession !== state.mediaSession) return;
    if (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    ) return;
    if (!state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)) return;
    state.mediaTransportStarted = true;
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    return;
  }
  if (data.type === 'MEDIA_PROXY_ERROR') {
    if (data.fileId && data.fileId !== state.selected?.id) return;
    const messageSession = Number(data.sessionId ?? data.mediaSession);
    const messageSourceGeneration = data.sourceGeneration == null
      ? null
      : Number(data.sourceGeneration);
    if (Number.isFinite(messageSession) && messageSession !== state.mediaSession) return;
    if (messageSourceGeneration != null && (
      !Number.isSafeInteger(messageSourceGeneration)
      || messageSourceGeneration !== mediaSourceGeneration
    )) return;
    if (!state.selected || !['range', 'range-retry'].includes(state.mediaAttempt)) return;
    clearMediaSeekWatchdog('proxy-error');
    clearMediaFrameWatchdog('proxy-error');
    state.lastProxyError = data;
    await recoverFromMediaProxyError(data);
  }
}

async function recoverFromMediaProxyError(data) {
  clearMediaSeekWatchdog('classified-failure');
  clearMediaFrameWatchdog('classified-failure');
  const retryFile = state.selected;
  if (!retryFile) return;
  const retrySession = state.mediaSession;
  const retrySourceGeneration = mediaSourceGeneration;
  const isVideo = isVideoPresentation(retryFile);
  const cause = classifyMediaProxyFailure(data);
  if (cause === 'source-pin') {
    retireQ0Playback();
    clearDirectMediaSources();
    state.mediaAttempt = 'failed';
    showMediaError('선택한 원본 버전을 안전하게 연결할 수 없습니다. 플레이어를 닫은 뒤 파일을 다시 열어 주세요.',
      { title: '원본 연결 확인 필요', showRetry: false });
    return;
  }
  if (isDriveSecurityRestriction(data) && !state.mediaAbuseAcknowledged) {
    state.mediaAttempt = 'security-confirmation';
    state.pendingSecurityConfirmation = {
      fileId: retryFile.id,
      session: retrySession,
      sourceGeneration: retrySourceGeneration,
      stage: 'range'
    };
    showMediaError(
      'Google Drive가 이 파일을 악성코드·바이러스 또는 악용 가능성이 있는 파일로 표시했습니다. 위험을 이해하고 직접 선택한 경우에만 원본 다운로드를 다시 시도합니다.',
      { title: '보안 경고가 있는 원본 파일', showRetry: false }
    );
    el.bufferOriginalButton.textContent = '위험을 이해하고 원본 재시도';
    el.bufferOriginalButton.hidden = false;
    return;
  }
  const action = decideMediaRecovery({
    cause,
    isVideo,
    downloadAllowed: retryFile.capabilities?.canDownload !== false,
    rangeRetryCount: state.mediaRetryCount,
    rangeRebuildCount: state.mediaRangeRebuildCount,
    permissionRetryCount: state.mediaPermissionRetryCount
  });

  if (action === 'refresh-auth' || action === 'refresh-permission') {
    const snapshot = capturePlaybackSnapshot();
    if (snapshot) state.resumePosition = { fileId: retryFile.id, time: snapshot.time, snapshot };
    state.retryAfterAuth = true;
    state.authRetryContext = { fileId: retryFile.id, mediaSession: retrySession };
    state.mediaAttempt = 'auth-refresh';
    if (action === 'refresh-permission') state.mediaPermissionRetryCount += 1;
    showMediaLoading();
    const refreshed = await requestSessionCredential({
      background: true,
      force: true,
      rejectedRevision: Number.isSafeInteger(data.rejectedRevision)
        ? data.rejectedRevision
        : state.tokenRevision
    });
    if (!isCurrentOriginalBufferOwner(retryFile, retrySession, retrySourceGeneration)) return;
    if (refreshed) {
      state.retryAfterAuth = false;
      state.authRetryContext = null;
      if (!retryOriginalStream(retryFile, retrySession, '연결 확인 완료 — 원본 스트림 다시 연결 중')) {
        await offerOriginalBufferFallback(
          retryFile,
          isVideo ? 'video' : 'image',
          retrySession,
          '원본 연결을 복구하지 못해',
          retrySourceGeneration
        );
      }
    } else {
      state.mediaAttempt = 'failed';
      showMediaError('Google 연결을 다시 확인해야 합니다. 아래 다시 시도를 눌러 계정 연결을 갱신하세요.', {
        title: 'Google Drive 재연결 필요'
      });
    }
    updateConnectionBadge();
    return;
  }

  if (action === 'fail-not-found') {
    state.mediaAttempt = 'failed';
    showMediaError('파일이 이동 또는 삭제되었거나 현재 계정에서 더 이상 볼 수 없습니다.', {
      title: '파일을 찾을 수 없습니다'
    });
    return;
  }

  if (action === 'fail-permission') {
    // A forbidden file does not invalidate the Google account session.
    state.mediaAttempt = 'failed';
    showMediaError(
      '현재 Google 계정 또는 OAuth 권한으로는 원본 파일을 읽을 수 없습니다. 다시 시도를 눌러 계정 권한을 직접 확인해 주세요.',
      { title: 'Google Drive 권한 확인 필요' }
    );
    updateConnectionBadge();
    return;
  }

  if (action === 'compatibility') {
    showDrivePreview(retryFile, cause === 'permission'
      ? '원본 다운로드 권한이 제한되어'
      : '원본 재생 경로를 사용할 수 없어');
    return;
  }

  if (action === 'rebuild-range') {
    state.mediaRangeRebuildCount += 1;
    const currentSize = getUnsatisfiedRangeSize(data.contentRange);
    if (currentSize != null) retryFile.size = String(currentSize);
  }
  if (action === 'retry-range' || action === 'rebuild-range') {
    const requestedDelay = Math.max(0, Number(data.retryAfterMs) || 0);
    const retryDelay = Math.max(250, Math.min(MAX_ORIGINAL_RETRY_AFTER_MS, requestedDelay || 700));
    const message = cause === 'range-416'
      ? '원본 파일 범위를 다시 확인해 스트림을 재구성하는 중'
      : cause === 'rate-limit'
        ? 'Drive 요청을 잠시 쉬었다가 원본으로 다시 연결합니다'
        : 'Drive 원본 스트림에 다시 연결하는 중';
    scheduleOriginalStreamRetry(retryFile, retrySession, retryDelay, message);
    return;
  }

  state.mediaAttempt = 'buffer-evaluating';
  await offerOriginalBufferFallback(
    retryFile,
    isVideo ? 'video' : 'image',
    retrySession,
    cause === 'range-416'
      ? '원본 파일 범위가 변경되어'
      : '원본 구간 스트림을 안정적으로 이어가지 못해',
    retrySourceGeneration
  );
}

function sendTokenToWorker() {
  if (!hasUsableToken() || !state.authAccountKey || !navigator.serviceWorker) return;
  const message = {
    type: hasAuthCapability('driveRead') ? 'SET_TOKEN' : 'CLEAR_TOKEN',
    credentialProtocol: AUTH_PROTOCOL,
    ...(hasAuthCapability('driveRead') ? { token: state.token, expiresAt: state.expiresAt } : {}),
    account: state.authAccountKey,
    revision: state.tokenRevision,
    accountGeneration: state.driveSessionGeneration
  };
  const registration = state.serviceWorkerRegistration;
  // The controller is usually also registration.active; post once per worker.
  new Set([navigator.serviceWorker.controller, registration?.active, registration?.waiting, registration?.installing])
    .forEach((worker) => worker?.postMessage(message));
}

function removeLegacyCredentialStorage() {
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CLIENT_ID_STORAGE_KEY);
  } catch (_) {}
}

function normalizeAuthCapabilities(value) {
  if (!value || value.version !== 1 || ['driveRead', 'driveWrite', 'appData'].some(key => typeof value[key] !== 'boolean')
    || (value.driveWrite && !value.driveRead)) return null;
  return { version: 1, driveRead: value.driveRead, driveWrite: value.driveWrite, appData: value.appData };
}
function hasAuthCapability(feature) {
  return state.authCapabilities?.version === 1 && state.authCapabilities[feature] === true;
}
function missingScopeError(feature) {
  const error = new Error(feature === 'appData'
    ? '기록 동기화 권한이 필요합니다. 다시 연결해 주세요.'
    : '이 Drive 기능의 권한이 필요합니다. 다시 연결해 주세요.');
  error.code = 'insufficient_scope';
  error.feature = feature;
  error.status = 403;
  return error;
}

function normalizeSessionCredential(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const capabilities = normalizeAuthCapabilities(value.capabilities);
  if (!capabilities) return null;
  const accessToken = typeof value.accessToken === 'string' ? value.accessToken : '';
  const expiresAt = value.expiresAt;
  const account = typeof value.account === 'string' ? value.account : '';
  const revision = value.revision;
  const sessionMarker = value.sessionMarker == null ? null : value.sessionMarker;
  if (!accessToken || accessToken.length > 16_384) return null;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + TOKEN_SKEW_MS) return null;
  if (!account || account.length > 256 || /[\s\x00-\x1f\x7f]/.test(account)) return null;
  if (!Number.isSafeInteger(revision) || revision < 1) return null;
  if (sessionMarker != null && (typeof sessionMarker !== 'string' || !/^[A-Za-z0-9_-]{43}$/u.test(sessionMarker))) return null;
  return { accessToken, expiresAt, account, revision, sessionMarker, capabilities };
}

function authErrorCode(value, fallback = 'auth_unavailable') {
  const code = typeof value?.error?.code === 'string' ? value.error.code : '';
  return AUTH_ERROR_CODES.has(code) ? code : fallback;
}

async function readAuthJson(response, { onTransportFailure } = {}) {
  const contentType = response.headers?.get?.('Content-Type') || '';
  if (!contentType.toLowerCase().includes('application/json')) return null;
  try { return await response.json(); }
  catch (error) {
    if (error?.name === 'AbortError' || error?.name === 'TypeError') onTransportFailure?.();
    return null;
  }
}

function installSessionCredential(value, { generation, rejectedRevision = null } = {}) {
  const credential = normalizeSessionCredential(value);
  if (!credential || generation !== state.authGeneration) return false;
  if (state.authAccountKey && credential.account !== state.authAccountKey) return false;
  if (Number.isSafeInteger(rejectedRevision) && credential.revision <= rejectedRevision) return false;
  if (credential.account === state.authAccountKey && credential.revision < state.tokenRevision) return false;
  if (credential.account === state.authAccountKey && credential.revision === state.tokenRevision
    && state.token && (credential.accessToken !== state.token
      || JSON.stringify(credential.capabilities) !== JSON.stringify(state.authCapabilities))) return false;
  state.authCapabilities = credential.capabilities;
  if (!hasAuthCapability('appData')) {
    state.accountStateAbortController?.abort();
    state.accountStateAbortController = null;
    stopAccountStateRefresh();
    clearTimeout(state.accountStateSyncTimer);
    clearTimeout(state.accountStateSyncRetryTimer);
    state.accountStateSyncTimer = state.accountStateSyncRetryTimer = null;
    state.accountStateLoaded = false;
    state.accountStateSyncError = missingScopeError('appData');
    updateAccountSyncStatus();
  }
  state.authAccountKey = credential.account;
  state.token = credential.accessToken;
  state.expiresAt = credential.expiresAt;
  state.tokenRevision = credential.revision;
  sessionCredentialMarker = credential.sessionMarker;
  state.authStatus = 'online';
  scheduleTokenRenewal();
  clearAuthError();
  sendTokenToWorker();
  updateConnectionBadge();
  resumeAfterCredential(generation);
  return true;
}

function resumeAfterCredential(generation) {
  setTimeout(async () => {
    if (generation !== state.authGeneration || !hasUsableToken()) return;
    if (!state.accountStateLoaded) {
      await initializeAccountMediaState().catch((error) => {
        reportAppFailure('account-state-sync', error, 'warn');
      });
    }
    if (generation !== state.authGeneration || state.accountIdentityPending) return;
    state.accountStateRefreshBlocked = !hasAuthCapability('appData');
    scheduleAccountStateRefresh(0);
    if (!hasAuthCapability('driveRead')) return;
    const retryContext = state.authRetryContext;
    if (
      state.retryAfterAuth && retryContext && state.selected?.id === retryContext.fileId
      && state.mediaSession === retryContext.mediaSession
    ) {
      const retryFile = state.selected;
      state.retryAfterAuth = false;
      state.authRetryContext = null;
      state.pendingPlay = state.resumePosition?.snapshot
        ? !state.resumePosition.snapshot.paused
        : true;
      openMediaSource(retryFile);
    } else if (state.retryAfterAuth) {
      state.retryAfterAuth = false;
      state.authRetryContext = null;
    } else if (!state.files.length) {
      loadFiles({ append: false });
    }
  }, 0);
}

function scheduleTokenRenewal() {
  if (tokenRenewalTimer !== null) clearTimeout(tokenRenewalTimer);
  tokenRenewalTimer = null;
  if (!state.token || !state.expiresAt) return;
  const generation = state.authGeneration;
  const account = state.authAccountKey;
  const revision = state.tokenRevision;
  const expiresAt = state.expiresAt;
  const current = () => generation === state.authGeneration && account === state.authAccountKey
    && revision === state.tokenRevision && expiresAt === state.expiresAt && Boolean(state.token);
  const schedule = (delay, retry = false) => {
    const timer = setTimeout(async () => {
      if (tokenRenewalTimer !== timer) return;
      tokenRenewalTimer = null;
      if (!current() || (retry && (!navigator.onLine || document.visibilityState === 'hidden'))) return;
      // A cached success is not renewal. Require the existing owner to advance
      // its revision while leaving enough runway for the entire bounded flight.
      const request = requestSessionCredential({ background: true, force: true, rejectedRevision: revision });
      const outcome = credentialRequestOutcome;
      const refreshed = await request;
      if (refreshed || !current() || outcome !== credentialRequestOutcome
        || outcome?.generation !== generation || !outcome.retryable || tokenRenewalTimer !== null
        || !navigator.onLine || document.visibilityState === 'hidden') return;
      schedule(15_000, true);
    }, delay);
    tokenRenewalTimer = timer;
  };
  schedule(Math.max(1_000, expiresAt - Date.now() - TOKEN_SKEW_MS - AUTH_CREDENTIAL_TIMEOUT_MS - 5_000));
}

function refreshForegroundCredential() {
  if (document.visibilityState === 'hidden' || !navigator.onLine) return;
  // Timers may have stopped during suspension or a history restore. All return
  // events share the existing auth owner; none opens a login popup or a player.
  if (state.token && state.expiresAt) {
    if (state.expiresAt - Date.now() < 5 * 60 * 1000) {
      requestSessionCredential({ background: true, force: true });
    } else {
      scheduleTokenRenewal();
    }
  }
  sendTokenToWorker();
}

function isIOSStandaloneWebApp() {
  const userAgent = typeof navigator.userAgent === 'string' ? navigator.userAgent : '';
  const appleMobile = /iPhone|iPad|iPod/i.test(userAgent)
    || (navigator.platform === 'MacIntel' && Number(navigator.maxTouchPoints) > 1);
  if (!appleMobile) return false;
  if (navigator.standalone === true) return true;
  try { return window.matchMedia?.('(display-mode: standalone)')?.matches === true; }
  catch (_) { return false; }
}

function clearStandaloneAuthAttempt(attempt = standaloneAuthAttempt) {
  if (!attempt || standaloneAuthAttempt !== attempt) return false;
  if (attempt.timer != null) clearTimeout(attempt.timer);
  if (attempt.deadlineTimer != null) clearTimeout(attempt.deadlineTimer);
  attempt.timer = null;
  attempt.deadlineTimer = null;
  standaloneAuthAttempt = null;
  return true;
}

function completeStandaloneAuthorization(attempt) {
  if (!clearStandaloneAuthAttempt(attempt)) return false;
  setConnectBusy(false);
  clearAuthError();
  showLibrary();
  return true;
}

function failStandaloneAuthorization(attempt, message) {
  if (!clearStandaloneAuthAttempt(attempt)) return false;
  setConnectBusy(false);
  if (hasUsableToken()) {
    showLibrary();
    showToast(message);
  } else {
    showSetup();
    setAuthError(message);
  }
  return true;
}

function expireStandaloneAuthorization(attempt) {
  if (!attempt || standaloneAuthAttempt !== attempt) return false;
  if (attempt.probePromise) {
    state.authGeneration += 1;
    credentialRequestAbortController?.abort();
    credentialRequestAbortController = null;
    credentialRequestPromise = null;
    credentialRequestGeneration = -1;
    credentialRequestOutcome = null;
  }
  return failStandaloneAuthorization(
    attempt,
    'Google 로그인 시간이 만료되었습니다. 홈 화면 앱 안에서 다시 시도해 주세요.'
  );
}

function markStandaloneAuthorizationHidden() {
  const attempt = standaloneAuthAttempt;
  if (!attempt) return false;
  attempt.awayObserved = true;
  if (attempt.timer != null) clearTimeout(attempt.timer);
  attempt.timer = null;
  return true;
}

function markStandaloneAuthorizationReturned({ pageshow = false } = {}) {
  const attempt = standaloneAuthAttempt;
  if (!attempt || (!pageshow && !attempt.awayObserved)) return false;
  attempt.awayObserved = false;
  attempt.returnEpoch += 1;
  attempt.nextProbe = 0;
  attempt.waitingForReturn = false;
  return true;
}

function resumeStandaloneAuthorization() {
  const attempt = standaloneAuthAttempt;
  if (!attempt || document.visibilityState === 'hidden' || attempt.returnEpoch < 1) return false;
  if (attempt.timer != null || attempt.probePromise) return true;
  const delay = AUTH_STANDALONE_RECOVERY_DELAYS_MS[attempt.nextProbe];
  if (!Number.isFinite(delay)) {
    attempt.waitingForReturn = true;
    setConnectBusy(true, 'Google 로그인 완료를 기다리는 중…');
    return true;
  }
  setConnectBusy(true, 'Google 로그인 결과 확인 중…');
  attempt.timer = setTimeout(async () => {
    attempt.timer = null;
    if (standaloneAuthAttempt !== attempt) return;
    if (document.visibilityState === 'hidden') return;
    attempt.nextProbe += 1;
    let connected = false;
    try {
      attempt.probePromise = requestSessionCredential({ background: true, force: true });
      connected = await attempt.probePromise;
    } catch (_) {
      connected = false;
    } finally {
      if (standaloneAuthAttempt === attempt) attempt.probePromise = null;
    }
    if (standaloneAuthAttempt !== attempt) return;
    const newSessionProved = connected && hasUsableToken()
      && typeof sessionCredentialMarker === 'string'
      && sessionCredentialMarker !== attempt.baselineSessionMarker;
    if (newSessionProved) {
      completeStandaloneAuthorization(attempt);
      return;
    }
    if (document.visibilityState === 'hidden') {
      attempt.nextProbe = Math.max(0, attempt.nextProbe - 1);
      return;
    }
    if (attempt.nextProbe >= AUTH_STANDALONE_RECOVERY_DELAYS_MS.length) {
      attempt.waitingForReturn = true;
      setConnectBusy(true, 'Google 로그인 완료를 기다리는 중…');
      return;
    }
    resumeStandaloneAuthorization();
  }, delay);
  return true;
}

function beginAuthorization() {
  if (!navigator.onLine) {
    setAuthError('오프라인에서는 Google 계정 연결을 시작할 수 없습니다.');
    return;
  }
  if (standaloneAuthAttempt) {
    setAuthError('열려 있는 Google 로그인 창을 완료한 뒤 이 화면으로 돌아오세요.');
    return;
  }
  clearAuthError();
  setConnectBusy(true);
  const target = new URL(AUTH_START_PATH, location.origin);
  target.searchParams.set('returnTo', `${location.pathname}${location.search}${location.hash}`);
  if (isIOSStandaloneWebApp()) {
    const attempt = {
      baselineSessionMarker: sessionCredentialMarker,
      awayObserved: false,
      returnEpoch: 0,
      waitingForReturn: false,
      nextProbe: 0,
      timer: null,
      probePromise: null,
      deadlineTimer: null
    };
    standaloneAuthAttempt = attempt;
    setConnectBusy(true, 'Google 로그인 진행 중…');
    let authWindow = null;
    try { authWindow = window.open(target.href, '_blank'); }
    catch (_) {}
    if (!authWindow) {
      failStandaloneAuthorization(
        attempt,
        'Google 로그인 창을 열지 못했습니다. 팝업을 허용한 뒤 다시 시도해 주세요.'
      );
      return;
    }
    try { authWindow.opener = null; } catch (_) {}
    attempt.deadlineTimer = setTimeout(() => {
      expireStandaloneAuthorization(attempt);
    }, AUTH_STANDALONE_DEADLINE_MS);
    attempt.deadlineTimer?.unref?.();
    return;
  }
  location.assign(target.href);
}

async function fetchSessionCredentialWithRetry(url, options, outcome) {
  const delays = [1_250, 2_500];
  const ensureCurrent = () => {
    options.signal.throwIfAborted();
    if (outcome.generation !== state.authGeneration || outcome.account !== state.authAccountKey) {
      throw new DOMException('Credential owner changed', 'AbortError');
    }
  };
  for (let attempt = 0; ; attempt++) {
    ensureCurrent();
    let response, failure;
    try { response = await fetch(url, options); }
    catch (error) { failure = error; }
    ensureCurrent();
    const payload = response?.status === 503 ? await readAuthJson(response.clone()) : null;
    ensureCurrent();
    outcome.retryable = failure?.name === 'TypeError'
      || (response?.status === 503 && authErrorCode(payload) === 'auth_unavailable');
    if (!outcome.retryable || attempt >= delays.length || !navigator.onLine) {
      if (failure) throw failure;
      return response;
    }
    // Only the same-origin auth POST retries; Drive reads and mutations retain
    // their own owners. All attempts share the caller's original total deadline.
    void response?.body?.cancel()?.catch(() => {});
    await new Promise((resolve, reject) => {
      let timer;
      const finish = (error) => {
        clearTimeout(timer);
        options.signal.removeEventListener('abort', onAbort);
        error ? reject(error) : resolve();
      };
      const onAbort = () => finish(options.signal.reason || new DOMException('Aborted', 'AbortError'));
      options.signal.addEventListener('abort', onAbort, { once: true });
      timer = setTimeout(() => finish(), delays[attempt]);
      if (options.signal.aborted) onAbort();
    });
  }
}

function requestSessionCredential({ background = false, force = false, rejectedRevision = null } = {}) {
  if (!force && hasUsableToken()) return Promise.resolve(true);
  if (!navigator.onLine) {
    credentialRequestOutcome = { generation: state.authGeneration, retryable: true };
    state.authStatus = 'auth-unavailable';
    updateConnectionBadge();
    return Promise.resolve(false);
  }
  const generation = state.authGeneration;
  const rejected = rejectedRevision == null
    ? null
    : Number.isSafeInteger(Number(rejectedRevision)) ? Number(rejectedRevision) : null;
  if (credentialRequestPromise) {
    const priorRequest = credentialRequestPromise;
    return priorRequest.catch(() => false).then((connected) => {
      if (generation !== state.authGeneration) return false;
      if (!connected) return false;
      if (connected && hasUsableToken() && (rejected == null || state.tokenRevision > rejected)) return true;
      if (rejected == null || !hasUsableToken()) return false;
      if (credentialRequestGeneration !== -1) {
        return new Promise((resolve) => queueMicrotask(() => {
          resolve(requestSessionCredential({ background, force, rejectedRevision: rejected }));
        }));
      }
      return requestSessionCredential({ background, force, rejectedRevision: rejected });
    });
  }
  if (!background) {
    setConnectBusy(true);
    updateConnectionBadge('busy');
  }

  const operation = (async () => {
    const controller = new AbortController();
    credentialRequestAbortController = controller;
    const outcome = { generation, account: state.authAccountKey, retryable: true };
    credentialRequestOutcome = outcome;
    const timeout = setTimeout(() => {
      // Headers alone do not complete a credential flight. Preserve recovery
      // for its total deadline, including a stalled successful response body.
      if (outcome.responseOk !== false) outcome.retryable = true;
      controller.abort();
    }, AUTH_CREDENTIAL_TIMEOUT_MS);
    try {
      const response = await fetchSessionCredentialWithRetry(new URL(AUTH_CREDENTIAL_PATH, location.origin), {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        mode: 'same-origin',
        redirect: 'error',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          [AUTH_CSRF_HEADER]: '1'
        },
        body: JSON.stringify({ expectedAccount: state.authAccountKey, rejectedRevision: rejected, credentialProtocol: 2 }),
        signal: controller.signal
      }, outcome);
      if (generation !== state.authGeneration) return false;
      outcome.responseOk = response.ok;
      const payload = await readAuthJson(response, {
        onTransportFailure: () => { if (response.ok) outcome.retryable = true; }
      });
      if (generation !== state.authGeneration) return false;
      if (!response.ok) {
        const code = authErrorCode(payload);
        state.authStatus = code === 'unauthorized' ? 'anonymous'
          : code === 'reconnect_required' || code === 'account_mismatch' ? 'reconnect-required'
            : 'auth-unavailable';
        if (state.token && ['unauthorized', 'reconnect_required', 'account_mismatch'].includes(code)) {
          clearToken(true, { preserveAccount: true });
        }
        if (!background && code !== 'unauthorized') {
          setAuthError(code === 'reconnect_required' || code === 'account_mismatch'
            ? 'Google 계정을 다시 연결해야 합니다.'
            : code === 'client_update_required' ? '앱을 새로 고친 뒤 다시 시도해 주세요.'
              : '인증 서비스에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.');
        }
        return false;
      }
      const installed = installSessionCredential(payload, { generation, rejectedRevision: rejected });
      if (!installed) state.authStatus = 'auth-unavailable';
      return installed;
    } catch (error) {
      if (error?.name !== 'AbortError') state.authStatus = 'auth-unavailable';
      if (!background && error?.name !== 'AbortError') {
        setAuthError('인증 서비스에 연결하지 못했습니다. 네트워크를 확인해 주세요.');
      }
      return false;
    } finally {
      clearTimeout(timeout);
      if (credentialRequestAbortController === controller) credentialRequestAbortController = null;
      if (!background) setConnectBusy(false);
      updateConnectionBadge();
    }
  })();

  credentialRequestPromise = operation;
  credentialRequestGeneration = generation;
  operation.finally(() => {
    if (credentialRequestPromise === operation) {
      credentialRequestPromise = null;
      credentialRequestGeneration = -1;
    }
  });
  return operation;
}

