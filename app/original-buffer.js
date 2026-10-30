'use strict';

// Temporary disk (OPFS) and memory original fallback.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

async function supportsWritableOpfs() {
  if (!navigator.storage?.getDirectory) return false;
  if (writableOpfsSupportPromise) return writableOpfsSupportPromise;
  writableOpfsSupportPromise = (async () => {
    let directory = null;
    let name = '';
    try {
      const root = await navigator.storage.getDirectory();
      directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY, { create: true });
      const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      name = `media-capability-${randomPart}.tmp`;
      const handle = await directory.getFileHandle(name, { create: true });
      return typeof handle.createWritable === 'function';
    } catch (_) {
      return false;
    } finally {
      if (directory && name) await directory.removeEntry(name).catch(() => {});
    }
  })();
  return writableOpfsSupportPromise;
}

async function resolveOriginalBufferPolicy(file) {
  let storageAvailable = 0;
  const opfsAvailable = !state.mediaExhaustedOriginalModes.has(PLAYBACK_MODE.OPFS)
    && await supportsWritableOpfs();
  if (opfsAvailable && navigator.storage?.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      storageAvailable = Math.max(0, Number(estimate?.quota || 0) - Number(estimate?.usage || 0));
    } catch (_) {}
  }
  return getOriginalBufferPolicy({
    size: q0PinnedSource && q0PinnedSource.descriptor.fileId === file?.id ? q0PinnedSource.descriptor.size : file?.size,
    mobile: isMobileDevice(),
    opfsAvailable,
    storageAvailable
  });
}

function showOriginalStorageLimit(
  file,
  session,
  reason,
  sourceGeneration = mediaSourceGeneration
) {
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return false;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  state.mediaAttempt = 'buffer-storage-limited';
  state.mediaPlaybackMode = '';
  state.mediaBufferStorageMode = '';
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.pendingOriginalBuffer = null;
  state.lastProxyError = null;
  updateQualityDisplay();
  const explanation = `${reason} 이 기기의 앱 전용 저장공간과 안전한 메모리 한도 안에서 원본을 준비할 수 없습니다. 저장공간을 확보한 뒤 다시 시도하거나 Google 호환 재생을 직접 선택하세요.`;
  if (el.codecNote) {
    el.codecNote.textContent = '기기 저장공간 또는 메모리 한도이며 파일 형식 비호환으로 판정하지 않았습니다.';
  }
  showMediaError(explanation, { title: '기기 저장공간 한도', showRetry: true });
  el.compatPlayerButton.hidden = false;
  return true;
}

async function offerOriginalBufferFallback(
  file,
  kind,
  session,
  reason,
  sourceGeneration = mediaSourceGeneration
) {
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return;
  const policy = await resolveOriginalBufferPolicy(file);
  if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) return;
  if (policy.decision === 'auto') {
    await startOriginalBlobFallback(file, kind, session, {
      confirmed: true,
      policy,
      expectedSourceGeneration: sourceGeneration
    });
    return;
  }
  if (policy.decision === 'denied') {
    showOriginalStorageLimit(
      file,
      session,
      `${reason} 원본 전체 임시 저장도 안전 한도를 넘어`,
      sourceGeneration
    );
    return;
  }
  state.mediaAttempt = 'buffer-choice';
  state.pendingOriginalBuffer = {
    fileId: file.id,
    kind,
    session,
    sourceGeneration,
    reason,
    policy
  };
  const locationLabel = policy.mode === 'disk' ? '앱 전용 임시 디스크' : '메모리';
  const sizeLabel = Number(file.size) > 0 ? formatBytes(Number(file.size)) : '크기 미확인';
  showMediaError(
    `${reason} ${sizeLabel} 원본 전체를 ${locationLabel}에 먼저 저장하면 화질 손실 없이 재생할 수 있습니다. 저장 완료 전까지 기다려야 하며, 다음 파일로 이동하면 즉시 삭제됩니다.`,
    { title: '원본 화질을 유지할까요?', showRetry: false }
  );
  el.bufferOriginalButton.hidden = false;
  el.compatPlayerButton.hidden = false;
}

function confirmOriginalBufferFallback() {
  const pending = state.pendingOriginalBuffer;
  if (!pending || !isCurrentOriginalBufferOwner(
    state.selected,
    pending.session,
    pending.sourceGeneration
  )) return;
  startOriginalBlobFallback(state.selected, pending.kind, pending.session, {
    confirmed: true,
    policy: pending.policy,
    expectedSourceGeneration: pending.sourceGeneration
  });
}

function confirmPendingMediaAction() {
  const pendingSecurity = state.pendingSecurityConfirmation;
  if (pendingSecurity) {
    if (!isCurrentOriginalBufferOwner(
      state.selected,
      pendingSecurity.session,
      pendingSecurity.sourceGeneration
    )) return;
    state.pendingSecurityConfirmation = null;
    state.mediaAbuseAcknowledged = true;
    el.bufferOriginalButton.textContent = '원본 전체 임시 저장';
    if (pendingSecurity.stage === 'full') {
      state.mediaAttempt = 'buffer-evaluating';
      startOriginalBlobFallback(state.selected, pendingSecurity.kind, pendingSecurity.session, {
        confirmed: true,
        policy: pendingSecurity.policy,
        rangeFallbackOnFailure: pendingSecurity.rangeFallbackOnFailure === true,
        expectedSourceGeneration: pendingSecurity.sourceGeneration
      });
    } else {
      retryOriginalStream(
        state.selected,
        pendingSecurity.session,
        '보안 경고 확인 완료 — 원본 스트림 다시 연결 중',
        { consumeRetry: false }
      );
    }
    return;
  }
  confirmOriginalBufferFallback();
}

function isOriginalTransferRateLimit(error) {
  return Number(error?.status) === 429
    || (Number(error?.status) === 403
      && (error?.reasons || []).some((reason) => /rateLimitExceeded/i.test(String(reason || ''))));
}

async function downloadOriginalFile(
  file,
  session,
  policy,
  signal,
  sourceGeneration = mediaSourceGeneration
) {
  const retired = q1RetirementResult || await q1Retirement;
  if (!retired.settled) throw new Error('Q1_CLEANUP_UNCONFIRMED');
  const headers = {};
  if (file.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${file.id}/${file.resourceKey}`;
  let lastError = null;

  while (state.mediaFullRequestCount < 3) {
    if (signal?.aborted || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    const attempt = state.mediaFullRequestCount;
    state.mediaFullRequestCount += 1;
    let response = null;
    const diagnosticRequestId = beginDirectMediaDiagnosticRequest(session, attempt + 1);
    try {
      response = await fetchOriginalFileResponse(file, { headers, signal, requireRevisionPin: true });
      emitDirectMediaDiagnosticStage(session, diagnosticRequestId, 'headers', {
        status: Number(response.status) || 0,
        totalBytes: Number(response.headers.get('Content-Length')) || 0
      });
      if (signal?.aborted || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        await response.body?.cancel();
        response = null;
        throw createOriginalBufferOwnerError();
      }
      const contentLength = Number(response.headers.get('Content-Length')) || 0;
      const metadataSize = Number(q0PinnedSource?.descriptor.fileId === file.id ? q0PinnedSource.descriptor.size : file.size) || 0;
      if (response.status !== 200) {
        const status = response.status;
        await response.body?.cancel();
        response = null;
        throw new Error(`Unexpected full-original status ${status}`);
      }
      if (metadataSize && contentLength && metadataSize !== contentLength) {
        await response.body?.cancel();
        response = null;
        throw new Error(`Original Content-Length mismatch (${contentLength}/${metadataSize})`);
      }
      if (contentLength && contentLength > policy.hardLimit) {
        await response.body?.cancel();
        response = null;
        throw new RangeError('Original file exceeds the temporary buffer limit');
      }
      const sourceFile = q0PinnedSource?.descriptor.fileId === file.id
        ? { ...file, size: q0PinnedSource.descriptor.size, mimeType: q0PinnedSource.descriptor.mimeType } : file;
      const originalFile = policy.mode === 'disk'
        ? await writeResponseIntoOpfs(
            response,
            sourceFile,
            session,
            policy.hardLimit,
            diagnosticRequestId,
            sourceGeneration
          )
        : await readResponseIntoBlob(
            response,
            sourceFile,
            session,
            policy.hardLimit,
            diagnosticRequestId,
            sourceGeneration
          );
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        cleanupOriginalTempStorage(session, sourceGeneration);
        throw createOriginalBufferOwnerError();
      }
      const expectedSize = metadataSize || contentLength;
      if (expectedSize && originalFile.size !== expectedSize) {
        cleanupOriginalTempStorage(session, sourceGeneration);
        throw new Error(`Original byte count mismatch (${originalFile.size}/${expectedSize})`);
      }
      if (!metadataSize && contentLength) { file.size = String(contentLength); sortedPopulationCache = null; }
      return originalFile;
    } catch (error) {
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        error = createOriginalBufferOwnerError();
      }
      lastError = error;
      emitDirectMediaDiagnosticStage(
        session,
        diagnosticRequestId,
        error?.name === 'AbortError' ? 'request-cancelled' : 'http-error', {
          status: Number(error?.status) || Number(response?.status) || 0,
          reason: error?.name === 'AbortError' ? 'session-cancelled' : 'full-original-failed'
        }, { terminal: true }
      );
      try { if (!response?.body?.locked) await response?.body?.cancel(); } catch (_) {}
      cleanupOriginalTempStorage(session, sourceGeneration);
      const rateLimited = isOriginalTransferRateLimit(error);
      const nonRetryable = error?.name === 'AbortError'
        || error?.name === 'RevisionPinError'
        || !isCurrentOriginalBufferOwner(file, session, sourceGeneration)
        || isDriveSecurityRestriction(error)
        || isLocalOriginalStorageError(error)
        || error instanceof RangeError
        || [401, 404].includes(Number(error?.status))
        || (Number(error?.status) === 403 && !rateLimited);
      if (nonRetryable || state.mediaFullRequestCount >= 3) throw error;
      const delayMs = Math.min(
        MAX_ORIGINAL_RETRY_AFTER_MS,
        Math.max(250, Number(error?.retryAfterMs) || 500 * (2 ** attempt))
      );
      await waitForRetry(delayMs, signal);
    }
  }
  throw lastError || new Error('Original file transfer retry budget exhausted');
}

// Keep native HEIC rendering when this browser can decode the actual MIME.
// A short-lived probe avoids forcing an SDR compatibility image on Safari.
async function prepareOriginalImageForDisplay(original, signal) {
  const head = new Uint8Array(await original.slice(0, 64).arrayBuffer());
  if (signal.aborted) throw createOriginalBufferOwnerError();
  if (head.length < 16 || String.fromCharCode(...head.subarray(4, 8)) !== 'ftyp') return {blob: original};
  let adapter;
  try { adapter = await import('../media/heif-image.mjs'); }
  catch {
    if (signal.aborted) throw createOriginalBufferOwnerError();
    throw new Error('IMAGE_FORMAT_MODULE_UNAVAILABLE');
  }
  const {isHeifHeader, decodeHeifImage} = adapter;
  if (signal.aborted) throw createOriginalBufferOwnerError();
  if (!isHeifHeader(head)) return {blob: original};
  const typed = original.slice(0, original.size, 'image/heic');
  const native = await new Promise((resolve, reject) => {
    const probe = new Image(), url = URL.createObjectURL(typed);
    let settled = false;
    const finish = (value, error) => {
      if (settled) return; settled = true;
      clearTimeout(timer); signal.removeEventListener('abort', abort);
      probe.onload = probe.onerror = null; probe.removeAttribute('src'); URL.revokeObjectURL(url);
      error ? reject(error) : resolve(value);
    };
    const abort = () => finish(false, createOriginalBufferOwnerError());
    const timer = setTimeout(() => finish(false), 5000);
    probe.onload = () => finish(probe.naturalWidth > 0);
    probe.onerror = () => finish(false);
    signal.addEventListener('abort', abort, {once: true});
    if (signal.aborted) abort(); else probe.src = url;
  });
  if (native) return {blob: typed, heic: true};
  return {...await decodeHeifImage(original, {signal}), heic: true, converted: true};
}

async function startOriginalBlobFallback(
  file,
  kind,
  session,
  {
    confirmed = false,
    policy = null,
    rangeFallbackOnFailure = false,
    expectedSourceGeneration = mediaSourceGeneration
  } = {}
) {
  if (!isCurrentOriginalBufferOwner(file, session, expectedSourceGeneration)) return;
  const resolvedPolicy = policy || await resolveOriginalBufferPolicy(file);
  if (!isCurrentOriginalBufferOwner(file, session, expectedSourceGeneration)) return;
  if (resolvedPolicy.decision === 'denied') {
    showOriginalStorageLimit(
      file,
      session,
      '원본 전체 임시 저장 크기가 이 기기의 안전 한도를 넘어',
      expectedSourceGeneration
    );
    return;
  }
  if (resolvedPolicy.decision === 'confirm' && !confirmed) {
    await offerOriginalBufferFallback(
      file,
      kind,
      session,
      '원본 구간 스트림을 이어가지 못해',
      expectedSourceGeneration
    );
    return;
  }

  const playbackSnapshot = kind === 'video'
    ? (state.resumePosition?.fileId === file.id && state.resumePosition.snapshot
        ? state.resumePosition.snapshot
        : capturePlaybackSnapshot())
    : null;
  state.mediaAttempt = 'blob-loading';
  state.mediaBufferStorageMode = resolvedPolicy.mode;
  state.mediaPlaybackMode = resolvedPolicy.mode === 'disk' ? PLAYBACK_MODE.OPFS : PLAYBACK_MODE.MEMORY;
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.pendingOriginalBuffer = null;
  state.lastProxyError = null;
  updateQualityDisplay();
  clearDirectMediaSources();
  if (kind === 'video') {
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
    if (poster) {
      el.videoPlayer.poster = poster;
      el.videoPlayer.classList.add('has-poster');
    }
    el.videoPlayer.hidden = false;
    el.videoPlayer.dataset.mediaSession = String(session);
  }
  showMediaLoading();
  const bufferController = new AbortController();
  state.mediaAbortController = bufferController;
  const bufferSourceGeneration = mediaSourceGeneration;

  try {
    const originalFile = await downloadOriginalFile(
      file,
      session,
      resolvedPolicy,
      bufferController.signal,
      bufferSourceGeneration
    );
    if (bufferController.signal.aborted || !isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) {
      cleanupOriginalTempStorage(session, bufferSourceGeneration);
      return;
    }

    const imagePresentation = kind === 'image'
      ? await prepareOriginalImageForDisplay(originalFile, bufferController.signal) : null;
    if (bufferController.signal.aborted || !isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) {
      cleanupOriginalTempStorage(session, bufferSourceGeneration);
      return;
    }
    state.mediaBlobUrl = URL.createObjectURL(imagePresentation?.blob || originalFile);
    if (imagePresentation?.converted) state.mediaPlaybackMode = PLAYBACK_MODE.IMAGE_COMPATIBILITY;
    mediaSourceGeneration += 1;
    state.mediaAttempt = 'blob';
    state.mediaTransportVerified = true;
    state.mediaTransportStarted = true;
    updateQualityDisplay();
    const locationLabel = resolvedPolicy.mode === 'disk' ? '앱 전용 임시 디스크' : '메모리';
    el.codecNote.textContent = `Drive 원본 파일 바이트를 ${locationLabel}에 임시 저장해 재인코딩 없이 재생 중입니다. 플레이어를 닫거나 이동하면 즉시 삭제됩니다.`;
    if (imagePresentation?.heic) el.codecNote.textContent = imagePresentation.converted
      ? '실제 형식은 HEIC입니다. 원본 파일은 그대로 두고 기본 이미지 한 장을 PNG로 변환해 표시합니다. 원본의 색상 정보와 동일한 표시를 보장하지 않습니다.'
      : '실제 형식은 HEIC입니다. 저장 파일의 바이트를 바꾸지 않고 이 브라우저에서 표시합니다.';

    if (kind === 'video') {
      el.videoPlayer.hidden = false;
      el.videoPlayer.dataset.mediaSession = String(session);
      el.videoPlayer.src = state.mediaBlobUrl;
      restorePlaybackSnapshot(el.videoPlayer, playbackSnapshot, session);
      el.videoPlayer.load();
      if (!playbackSnapshot || !playbackSnapshot.paused) {
        state.pendingPlay = true;
        attemptCurrentPlayback(session);
      }
    } else {
      el.imageViewer.hidden = false;
      el.imageViewer.dataset.mediaSession = String(session);
      el.imageViewer.alt = file.name || '원본 이미지';
      el.imageViewer.src = state.mediaBlobUrl;
    }
  } catch (error) {
    if (error.name === 'AbortError' || error.message === 'HEIF_CANCELLED'
      || !isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) {
      cleanupOriginalTempStorage(session, bufferSourceGeneration);
      return;
    }
    reportAppFailure('original-buffer-fallback', error);
    cleanupOriginalTempStorage(session, bufferSourceGeneration);
    if (error.message === 'IMAGE_FORMAT_MODULE_UNAVAILABLE') {
      state.mediaAttempt = 'failed';
      showMediaError('이미지 호환 기능을 불러오지 못했습니다. 다시 시도해 주세요.',
        {title: '이미지 호환 표시 확인 필요', showRetry: true});
      return;
    }
    if (/^HEIF_/.test(error.message || '')) {
      state.mediaAttempt = 'failed';
      const limit = ['HEIF_INPUT_LIMIT','HEIF_PIXEL_LIMIT','HEIF_DEPTH_UNSUPPORTED'].includes(error.message);
      showMediaError(limit
        ? '이 HEIC 이미지의 크기 또는 색 심도가 이 브라우저의 호환 표시 범위를 넘습니다. Drive의 원본 파일은 변경되지 않았습니다.'
        : 'HEIC 이미지를 호환 표시로 준비하지 못했습니다. Drive의 원본 파일은 변경되지 않았습니다.',
      {title: '이미지 호환 표시 확인 필요', showRetry: false});
      return;
    }
    if (classifyMediaProxyFailure(error) === 'source-pin') {
      await recoverFromMediaProxyError(error);
      return;
    }
    if (rangeFallbackOnFailure && resolvedPolicy.mode === 'disk' && isLocalOriginalStorageError(error)) {
      state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      startOriginalRangePlayback(file, kind, session, '임시 디스크를 사용할 수 없어 Drive 원본 스트림으로 연결 중');
      return;
    }
    if (resolvedPolicy.mode === 'disk' && isLocalOriginalStorageError(error)) {
      state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      const memoryPolicy = getOriginalBufferPolicy({
        size: file.size,
        mobile: isMobileDevice(),
        opfsAvailable: false
      });
      if (memoryPolicy.decision === 'auto') {
        await startOriginalBlobFallback(file, kind, session, {
          confirmed: true,
          policy: memoryPolicy,
          expectedSourceGeneration: bufferSourceGeneration
        });
        return;
      }
      if (memoryPolicy.decision === 'confirm') {
        state.mediaAttempt = 'buffer-choice';
        state.pendingOriginalBuffer = {
          fileId: file.id,
          kind,
          session,
          sourceGeneration: bufferSourceGeneration,
          reason: '임시 디스크 저장을 완료하지 못해',
          policy: memoryPolicy
        };
        const sizeLabel = Number(file.size) > 0 ? formatBytes(Number(file.size)) : '크기 미확인';
        showMediaError(
          `임시 디스크 저장을 완료하지 못했습니다. ${sizeLabel} 원본을 제한된 메모리에 저장해 다시 시도할 수 있습니다.`,
          { title: '메모리 원본 재생으로 전환할까요?', showRetry: false }
        );
        el.bufferOriginalButton.textContent = '메모리에 원본 저장';
        el.bufferOriginalButton.hidden = false;
        el.compatPlayerButton.hidden = false;
        return;
      }
      if (memoryPolicy.decision === 'denied') {
        showOriginalStorageLimit(
          file,
          session,
          '앱 전용 임시 디스크 저장을 완료하지 못했고 원본 크기가 안전한 메모리 한도를 넘어',
          bufferSourceGeneration
        );
        return;
      }
    }
    if (isLocalOriginalStorageError(error)
      || (resolvedPolicy.mode === 'memory' && error instanceof RangeError)) {
      showOriginalStorageLimit(
        file,
        session,
        resolvedPolicy.mode === 'disk'
          ? '앱 전용 임시 디스크 저장을 완료하지 못해'
          : '안전한 메모리 원본 준비를 완료하지 못해',
        bufferSourceGeneration
      );
      return;
    }
    if (isDriveSecurityRestriction(error) && !state.mediaAbuseAcknowledged) {
      state.mediaAttempt = 'security-confirmation';
      state.pendingSecurityConfirmation = {
        fileId: file.id,
        session,
        sourceGeneration: bufferSourceGeneration,
        stage: 'full',
        kind,
        policy: resolvedPolicy,
        rangeFallbackOnFailure
      };
      showMediaError(
        'Google Drive가 이 파일을 악성코드·바이러스 또는 악용 가능성이 있는 파일로 표시했습니다. 위험을 이해하고 직접 선택한 경우에만 원본 다운로드를 다시 시도합니다.',
        { title: '보안 경고가 있는 원본 파일', showRetry: false }
      );
      el.bufferOriginalButton.textContent = '위험을 이해하고 원본 재시도';
      el.bufferOriginalButton.hidden = false;
    } else if (error.status === 401) {
      clearRejectedToken(error);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (classifyMediaProxyFailure(error) === 'permission') {
      if (state.mediaPermissionRetryCount < 1) {
        state.mediaPermissionRetryCount += 1;
        if (playbackSnapshot) {
          state.resumePosition = { fileId: file.id, time: playbackSnapshot.time, snapshot: playbackSnapshot };
        }
        state.mediaAttempt = 'auth-refresh';
        showMediaLoading();
        const refreshed = await requestSessionCredential({
          background: true,
          force: true,
          rejectedRevision: error.rejectedTokenRevision
        });
        if (!isCurrentOriginalBufferOwner(file, session, bufferSourceGeneration)) return;
        if (refreshed) {
          state.mediaAttempt = 'buffer-evaluating';
          await startOriginalBlobFallback(file, kind, session, {
            confirmed: true,
            policy: resolvedPolicy,
            rangeFallbackOnFailure,
            expectedSourceGeneration: bufferSourceGeneration
          });
          return;
        }
      }
      // Keep the session: this is a file permission error, not invalid credentials.
      state.mediaAttempt = 'failed';
      showMediaError(
        '현재 Google 계정 또는 OAuth 권한으로는 원본 파일을 읽을 수 없습니다. 다시 시도를 눌러 계정 권한을 직접 확인해 주세요.',
        { title: 'Google Drive 권한 확인 필요' }
      );
      updateConnectionBadge();
    } else if (classifyMediaProxyFailure(error) === 'download-restricted') {
      showDrivePreview(file, '원본 다운로드가 제한되어');
    } else if (rangeFallbackOnFailure) {
      if (resolvedPolicy.mode === 'disk') state.mediaExhaustedOriginalModes.add(PLAYBACK_MODE.OPFS);
      startOriginalRangePlayback(file, kind, session, '임시 디스크 전송을 완료하지 못해 Drive 원본 스트림으로 연결 중');
    } else if (error instanceof RangeError || /byte count mismatch/i.test(error.message || '')) {
      showDrivePreview(file, '원본 전체 임시 저장을 안전하게 완료하지 못해');
    } else {
      showDrivePreview(file, '원본 전체 전송을 완료하지 못해');
    }
  } finally {
    if (state.mediaAbortController === bufferController) state.mediaAbortController = null;
  }
}

function updateOriginalBufferProgress(received, total) {
  const now = performance.now();
  if (now - updateOriginalBufferProgress.lastUpdate < 180 && (!total || received < total)) return;
  const percent = Number.isFinite(total) && total > 0 && Number.isFinite(received)
    ? (received / total) * 100 : null;
  setMediaLoadingProgress(percent);
  updateOriginalBufferProgress.lastUpdate = now;
}
updateOriginalBufferProgress.lastUpdate = -Infinity;

async function readResponseIntoBlob(
  response,
  file,
  session,
  hardLimit,
  diagnosticRequestId = '',
  sourceGeneration = mediaSourceGeneration
) {
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  if (!response.body?.getReader) {
    throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
  }

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
        throw createOriginalBufferOwnerError();
      }
      if (done) break;
      received += value.byteLength;
      recordDirectMediaDiagnosticBytes(session, diagnosticRequestId, received, total);
      if (received > hardLimit) {
        throw new RangeError('Original file exceeds the memory buffer limit');
      }
      chunks.push(value);
      updateOriginalBufferProgress(received, total);
    }
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    completeDirectMediaDiagnosticRequest(session, diagnosticRequestId, received, total);
    return new Blob(chunks, { type: file.mimeType || response.headers.get('Content-Type') || 'application/octet-stream' });
  } catch (error) {
    try { await reader.cancel(error); } catch (_) {}
    throw error;
  } finally {
    reader.releaseLock?.();
  }
}

async function acquireOriginalBufferLease(name) {
  if (!navigator.locks?.request) return () => {};
  let release;
  const lifetime = new Promise((resolve) => { release = resolve; });
  return new Promise((resolve, reject) => {
    navigator.locks.request(`drive-original:media:${name}`, async () => {
      resolve(release);
      await lifetime;
    }).catch(reject);
  });
}

async function writeResponseIntoOpfs(
  response,
  file,
  session,
  hardLimit,
  diagnosticRequestId = '',
  sourceGeneration = mediaSourceGeneration
) {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY, { create: true });
  const randomPart = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const sourceExtension = /\.([A-Za-z0-9]{1,8})$/.exec(String(file.name || ''))?.[1];
  const mimeExtension = {
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'image/heif': 'heif'
  }[String(file.mimeType || '').toLowerCase()];
  const extension = String(sourceExtension || mimeExtension || 'bin').toLowerCase();
  const name = `media-v2-${session}-${randomPart}.${extension}`;
  const releaseLease = await acquireOriginalBufferLease(name);
  let writable;
  let reader;
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  let received = 0;
  try {
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      throw createOriginalBufferOwnerError();
    }
    const handle = await directory.getFileHandle(name, { create: true });
    if (typeof handle.createWritable !== 'function') {
      throw new DOMException('Writable OPFS is unavailable', 'NotSupportedError');
    }
    writable = await handle.createWritable();
    reader = response.body?.getReader();
    if (!reader) {
      throw new DOMException('Streaming response reader is unavailable', 'NotSupportedError');
    } else {
      while (true) {
        const { done, value } = await reader.read();
        if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
          await reader.cancel();
          throw createOriginalBufferOwnerError();
        }
        if (done) break;
        received += value.byteLength;
        recordDirectMediaDiagnosticBytes(session, diagnosticRequestId, received, total);
        if (received > hardLimit) {
          await reader.cancel();
          throw new RangeError('Original file exceeds temporary storage');
        }
        await writable.write(value);
        if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
          await reader.cancel();
          throw createOriginalBufferOwnerError();
        }
        updateOriginalBufferProgress(received, total);
      }
    }
    await writable.close();
    completeDirectMediaDiagnosticRequest(session, diagnosticRequestId, received, total);
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      await directory.removeEntry(name).catch(() => {});
      throw createOriginalBufferOwnerError();
    }
    const storedFile = await handle.getFile();
    if (!isCurrentOriginalBufferOwner(file, session, sourceGeneration)) {
      await directory.removeEntry(name).catch(() => {});
      throw createOriginalBufferOwnerError();
    }
    state.mediaTempStorage = { directory, name, session, sourceGeneration, releaseLease };
    return storedFile;
  } catch (error) {
    try {
      if (reader) await reader.cancel(error);
      else await response.body?.cancel(error);
    } catch (_) {}
    try { await writable?.abort(error); } catch (_) {}
    try { await directory.removeEntry(name); } catch (_) {}
    releaseLease();
    throw error;
  } finally {
    reader?.releaseLock?.();
  }
}

function cleanupOriginalTempStorage(session = null, sourceGeneration = null) {
  const temporary = state.mediaTempStorage;
  if (session != null && temporary?.session !== session) return;
  if (sourceGeneration != null && temporary?.sourceGeneration !== sourceGeneration) return;
  state.mediaTempStorage = null;
  if (temporary?.directory && temporary.name) {
    temporary.directory.removeEntry(temporary.name).catch(() => {})
      .finally(() => temporary.releaseLease?.());
  }
}

async function cleanupStaleOriginalBuffers() {
  // Only v2 files participate in the lease protocol. Do not sweep unknown
  // legacy files or another tab's active playback based only on a filename.
  if (!navigator.storage?.getDirectory || !navigator.locks?.request) return;
  try {
    const root = await navigator.storage.getDirectory();
    const directory = await root.getDirectoryHandle(ORIGINAL_BUFFER_DIRECTORY);
    for await (const name of directory.keys()) {
      if (!String(name).startsWith('media-v2-')) continue;
      await navigator.locks.request(`drive-original:media:${name}`, { ifAvailable: true }, async (lock) => {
        if (lock) await directory.removeEntry(name).catch(() => {});
      });
    }
  } catch (_) {
    // The app-owned temporary directory does not exist yet or storage is unavailable.
  }
}

