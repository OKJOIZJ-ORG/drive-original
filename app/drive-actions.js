'use strict';

// Google preview, trash and move with verified Drive mutations.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function clearDrivePreviewTimers() {
  clearTimeout(drivePreviewTimeoutTimer);
  drivePreviewTimeoutTimer = null;
}

function clearDrivePreview() {
  clearDrivePreviewTimers();
  if (el.drivePreview) {
    el.drivePreview.hidden = true;
    el.drivePreview.classList.remove('is-ready');
    delete el.drivePreview.dataset.mediaSession;
    if (el.drivePreview.getAttribute('src') && el.drivePreview.getAttribute('src') !== 'about:blank') {
      el.drivePreview.src = 'about:blank';
    }
  }
  if (el.drivePreviewActions) el.drivePreviewActions.hidden = true;
  el.mediaStage?.classList.remove('drive-preview-active');
  el.playerModal?.classList.remove('drive-preview-mode');
}

function showDrivePreview(file, reason, { userInitiated = false } = {}) {
  if (!file || state.selected?.id !== file.id) return;
  clearTimeout(mediaRecoveryTimer);
  mediaRecoveryTimer = null;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  clearDrivePreview();
  // An exhausted original path is a local failure, never permission to load
  // a third-party document or claim compatibility playback succeeded.
  if (!userInitiated) {
    state.mediaAttempt = 'failed';
    state.pendingPlay = false;
    state.pendingOriginalBuffer = null;
    state.drivePreviewReason = reason;
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    emitMediaDiagnosticStage('original-playback-unavailable', { reason, terminal: true });
    showMediaError('이 파일을 앱에서 재생하지 못했습니다.', { showDrive: true });
    el.codecNote.textContent = reason;
    el.compatPlayerButton.hidden = false;
    updateQualityDisplay();
    return;
  }
  emitMediaDiagnosticStage('compatibility-selected', {
    route: 'compatibility', reason, terminal: true
  });
  state.mediaSession += 1;
  const previewSession = state.mediaSession;
  updateMediaDiagnosticSession(previewSession, 'compatibility');
  state.mediaAttempt = 'drive-preview-loading';
  state.mediaPlaybackMode = PLAYBACK_MODE.COMPATIBILITY;
  state.mediaTransportVerified = false;
  state.mediaTransportStarted = false;
  state.lastProxyError = null;
  state.pendingPlay = false;
  state.pendingOriginalBuffer = null;
  state.drivePreviewReason = reason;

  setNativeVideoActionsAvailable(false);
  updatePlayPauseUI();
  clearTimeout(controlsHideTimer);
  setPlayerChromeVisible(false);
  el.playerModal?.classList.remove('media-recovery-mode');
  el.mediaStage?.classList.add('drive-preview-active');
  el.playerModal?.classList.add('drive-preview-mode');
  if (el.drivePreviewActions) el.drivePreviewActions.hidden = false;
  showMediaLoading();

  el.drivePreview.title = `${file.name || '미디어'} · Google Drive 호환 재생기`;
  el.drivePreview.dataset.mediaSession = String(previewSession);
  el.drivePreview.hidden = false;
  el.drivePreview.src = buildDrivePreviewUrl(file);
  el.codecNote.textContent = '직접 선택한 Google 미리보기입니다. 실제 재생과 원본 화질은 앱에서 확인할 수 없습니다.';
  updateQualityDisplay();

  drivePreviewTimeoutTimer = window.setTimeout(() => {
    if (state.mediaSession === previewSession && state.mediaAttempt === 'drive-preview-loading') {
      handleDrivePreviewFailure();
    }
  }, DRIVE_PREVIEW_TIMEOUT_MS);
}

function handleDrivePreviewLoad(event) {
  const frame = event?.currentTarget || el.drivePreview;
  if (!frame || frame.getAttribute('src') === 'about:blank') return;
  if (!isCurrentMediaEvent(frame) || !state.mediaAttempt.startsWith('drive-preview')) return;
  // A cross-origin iframe load only proves that a page document appeared; it
  // cannot prove video playback, login state, codec support, or final quality.
  // Keep the visible retry/direct-open actions available for the whole session.
  clearDrivePreviewTimers();
  state.mediaAttempt = 'drive-preview-page';
  frame.classList.add('is-ready');
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  hideSwipeNeighbor({ immediate: false });
  updateQualityDisplay();
}

function handleDrivePreviewFailure(event) {
  const frame = event?.currentTarget || el.drivePreview;
  if (frame && frame.dataset?.mediaSession && !isCurrentMediaEvent(frame)) return;
  if (!state.mediaAttempt.startsWith('drive-preview')) return;
  clearDrivePreviewTimers();
  state.mediaAttempt = 'drive-preview-error';
  updateQualityDisplay();
  showMediaError('Google 미리보기를 불러오지 못했습니다. 원본을 다시 시도하거나 Drive에서 열어 주세요.', {
    title: '호환 재생기 연결 지연',
    showDrive: true,
    showRetry: true
  });
}

function buildDrivePreviewUrl(file) {
  const url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(file?.id || '')}/preview`);
  if (file?.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.href;
}

function buildDriveViewUrl(file) {
  const url = file?.webViewLink
    ? new URL(file.webViewLink)
    : new URL(`https://drive.google.com/file/d/${encodeURIComponent(file?.id || '')}/view`);
  if (file?.resourceKey && !url.searchParams.has('resourcekey')) {
    url.searchParams.set('resourcekey', file.resourceKey);
  }
  return url.href;
}

function openSelectedInDrive() {
  if (!state.selected) return;
  window.open(buildDriveViewUrl(state.selected), '_blank', 'noopener,noreferrer');
}

/* 터치 확인 피드백 — 버튼을 눌렀다는 짧은 시각적 반응.
   :active는 손가락을 떼는 순간 사라져 전달력이 약하므로 별도 플래시를 얹는다. */
function flashPressed(node) {
  if (!node) return;
  node.classList.remove('flash-pressed');
  void node.offsetWidth;
  node.classList.add('flash-pressed');
  setTimeout(() => node.classList.remove('flash-pressed'), 280);
}

/* 진행 중 로딩 표시 — 작업 완료까지의 공백을 스피너+라벨로 채운다. */
function setButtonLoading(button, loading, label) {
  if (!button) return;
  if (loading) {
    if (!button.dataset.originalLabel) button.dataset.originalLabel = button.textContent;
    button.textContent = label;
    button.classList.add('is-loading');
  } else {
    button.classList.remove('is-loading');
    if (button.dataset.originalLabel) {
      button.textContent = button.dataset.originalLabel;
      delete button.dataset.originalLabel;
    }
  }
}

function formatActionTarget(files) {
  const items = Array.isArray(files) ? files : [];
  if (items.length <= 1) return items[0]?.name || '이름 없는 파일';
  const firstName = items[0]?.name || '이름 없는 파일';
  return `${items.length.toLocaleString('ko-KR')}개 파일 · ${firstName} 외 ${items.length - 1}개`;
}

function actionFilesSnapshot() {
  if (state.accountIdentityPending && !state.demo) return [];
  return state.pendingActionFiles.length ? [...state.pendingActionFiles] : getActionFiles();
}

function settleSelectionAfterBulk(failedFiles) {
  state.pendingActionFiles = [];
  if (!state.selectionMode) return;
  const failedIds = new Set((failedFiles || []).map((file) => file.id));
  if (!failedIds.size) {
    exitSelectionMode();
    return;
  }
  state.selectedFileIds = failedIds;
  updateSelectionUI();
}

function requestDeleteFile() {
  const files = getActionFiles();
  if (!files.length || state.deleting || state.bulkAction) return;
  state.pendingActionFiles = [...files];
  if (el.deleteDialog && el.deleteFileName) {
    el.deleteFileName.textContent = formatActionTarget(files);
    if (!el.deleteDialog.open) el.deleteDialog.showModal();
  }
}

const DRIVE_MUTATION_PREFIX = 'drive-original.mutation.v1.';
const DRIVE_MUTATION_FIELDS = 'id,parents,trashed,version,driveId,mimeType,resourceKey,shortcutDetails,ownedByMe,appProperties,capabilities(canTrash,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren)';
const DRIVE_MUTATION_PENDING = new Set(['submitted', 'verifying', 'uncertain']);

// Candidate-only admission uses a reviewed, persisted creation ledger, never
// caller-supplied ownership metadata. The lease and request registry stay local
// to this document; neither a storage row nor a forged Symbol is a send permit.
const disposableDriveMutations = (() => {
  const issued = new WeakMap();
  let active = null;
  const deny = () => { throw driveMutationError('failed', '일회용 검증 파일의 권한을 확인하지 못했습니다.', 423); };
  const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_-]{5,200}$/.test(id) && id !== 'appDataFolder';
  const sortedParents = value => Array.isArray(value) ? [...value].sort() : null;
  const sameParents = (a, b) => JSON.stringify(sortedParents(a)) === JSON.stringify(sortedParents(b));
  const folderMime = 'application/vnd.google-apps.folder';
  function ledger(scope) {
    let value;
    try { value = JSON.parse(localStorage.getItem(scope.key)); } catch (_) { deny(); }
    if (value?.schema !== 1 || value.run !== scope.run || value.accountKey !== scope.owner.accountKey
      || value.accountId !== scope.owner.accountId || !Array.isArray(value.planned) || !Array.isArray(value.created)
      || new Set(value.planned.map(row => row.id)).size !== value.planned.length
      || new Set(value.created.map(row => row.id)).size !== value.created.length) deny();
    return value;
  }
  function receipt(scope, id, isTarget = false) {
    const value = ledger(scope);
    const planned = value.planned.find(row => row.id === id);
    const created = value.created.find(row => row.id === id);
    if (!idOK(id) || !planned || planned.sent !== true || !created || planned.role !== created.role
      || !(isTarget ? /^folder-[ab]$/.test(created.role) : /^test-(image|video)-[12]$/.test(created.role))) deny();
    const meta = created.metadata;
    if (meta?.id !== id || meta.ownedByMe !== true || meta.driveId || !meta.version
      || typeof meta.version !== 'string' || !/^\d+$/.test(meta.version) || typeof meta.trashed !== 'boolean'
      || !Array.isArray(meta.parents) || meta.parents.length !== 1 || !idOK(meta.parents[0])
      || meta.appProperties?.qaRun !== scope.run || meta.appProperties?.qaRole !== created.role
      || (isTarget ? meta.mimeType !== folderMime : !/^(image|video)\//.test(meta.mimeType))) deny();
    if (!isTarget && !value.created.some(row => row.id === meta.parents[0] && /^folder-[ab]$/.test(row.role)
      && value.planned.some(plan => plan.id === row.id && plan.role === row.role && plan.sent === true))) deny();
    return created;
  }
  function assert(scope) {
    try { scope.owner.assert(); } catch (error) { close(scope); throw error; }
    if (active !== scope || scope.closed || Date.now() >= scope.deadline || scope.signal.aborted
      || state.token !== scope.token || state.tokenRevision !== scope.tokenRevision
      || APP_VERSION !== scope.sourceVersion || location.href !== scope.sourceUrl
      || navigator.serviceWorker?.controller !== scope.controller || !scope.controller
      || !hasUsableToken() || !hasAuthCapability('driveWrite')) { close(scope); deny(); }
  }
  function close(scope) {
    if (!scope || scope.closed) return;
    scope.closed = true;
    scope.signal.removeEventListener('abort', scope.abort);
    window.removeEventListener('pagehide', scope.abort);
    window.removeEventListener('beforeunload', scope.abort);
    scope.permits.forEach(permit => release(permit));
    scope.permits.clear();
    if (active === scope) active = null;
  }
  function activate({ run, fileIds, targetIds, sourceVersion, durationMs = 120_000 } = {}) {
    if (DRIVE_MUTATIONS_ENABLED || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(run || '')
      || sourceVersion !== APP_VERSION || !Array.isArray(fileIds) || fileIds.length !== 2
      || new Set(fileIds).size !== 2 || !fileIds.every(idOK)
      || !Array.isArray(targetIds) || !targetIds.length || targetIds.length > 2
      || new Set(targetIds).size !== targetIds.length || !targetIds.every(idOK)
      || !Number.isFinite(durationMs) || durationMs <= 0 || durationMs > 120_000) deny();
    const owner = captureDriveMutationOwner();
    const scope = { run, owner, files: new Set(fileIds), targets: new Set(targetIds), sourceVersion,
      key: `drive-original.qa.disposable.${run}.recovery`, sourceUrl: location.href,
      token: state.token, tokenRevision: state.tokenRevision, controller: navigator.serviceWorker?.controller,
      signal: owner.options.signal, deadline: Date.now() + durationMs, permits: new Set(), closed: false };
    close(active);
    active = scope;
    scope.abort = () => close(scope);
    scope.signal.addEventListener('abort', scope.abort, { once: true });
    window.addEventListener('pagehide', scope.abort);
    window.addEventListener('beforeunload', scope.abort);
    try {
      assert(scope);
      scope.files.forEach(id => receipt(scope, id));
      scope.targets.forEach(id => receipt(scope, id, true));
    } catch (error) { close(scope); throw error; }
    return Object.freeze({ close: () => close(scope) });
  }
  function select(owner, file, action, target) {
    const scope = active;
    if (!scope) throw driveMutationError('failed', '후보의 파일 변경은 검증 완료 전까지 잠겨 있습니다.', 423);
    assert(scope); owner.assert();
    if (owner.accountKey !== scope.owner.accountKey || owner.accountId !== scope.owner.accountId
      || !scope.files.has(file.id) || !['trash', 'move'].includes(action)
      || (action === 'move' && !scope.targets.has(target?.id))) deny();
    receipt(scope, file.id);
    if (action === 'move') receipt(scope, target.id, true);
    return scope;
  }
  function validate(scope, meta, isTarget = false) {
    assert(scope);
    const row = receipt(scope, meta.id, isTarget);
    if (meta.ownedByMe !== true || meta.driveId || meta.appProperties?.qaRun !== scope.run
      || meta.appProperties?.qaRole !== row.role || meta.mimeType !== row.metadata.mimeType
      || (isTarget ? !/^\d+$/.test(meta.version || '') || !/^\d+$/.test(row.metadata.version)
        || BigInt(meta.version) < BigInt(row.metadata.version) : meta.version !== row.metadata.version)
      || meta.trashed !== row.metadata.trashed
      || !sameParents(meta.parents, row.metadata.parents)) deny();
  }
  async function checkFolders(scope, owner, before, target) {
    assert(scope); owner.assert();
    if (before.parents.length !== 1) deny();
    const ids = new Set([before.parents[0], ...(target ? [target.id] : [])]);
    for (const id of ids) {
      receipt(scope, id, true);
      const folder = target?.id === id ? target : await readDriveMutationMetadata({ id }, owner);
      validate(scope, folder, true);
      if (folder.trashed || folder.capabilities.canAddChildren !== true) deny();
      // Two admitted files fit in one complete page. Any unknown child or
      // continuation makes this QA folder unsuitable; never traverse originals.
      const params = new URLSearchParams({ q: `'${escapeDriveQueryLiteral(id)}' in parents and trashed = false`,
        spaces: 'drive', pageSize: '3', fields: 'nextPageToken,incompleteSearch,files(id)' });
      const response = await driveFetch(`${DRIVE_API}/files?${params}`, { ...owner.options, driveMaxRateAttempts: 1 });
      const children = await response.json();
      assert(scope); owner.assert();
      if (children.incompleteSearch !== false || children.nextPageToken || !Array.isArray(children.files)
        || children.files.length > 2 || new Set(children.files.map(row => row.id)).size !== children.files.length
        || children.files.some(row => !scope.files.has(row.id))) deny();
    }
  }
  function issue(scope, owner, entry, target, url, options) {
    assert(scope); owner.assert();
    if (entry.state !== 'submitted' || !scope.files.has(entry.fileId) || entry.before?.id !== entry.fileId
      || !['trash', 'move'].includes(entry.action) || (entry.action === 'trash' && target)) deny();
    validate(scope, entry.before);
    if (entry.action === 'move') {
      if (!scope.targets.has(target?.id) || entry.targetId !== target.id) deny();
      validate(scope, target, true);
    }
    const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
    if (entry.action === 'move') { params.set('addParents', target.id); params.set('removeParents', entry.before.parents.join(',')); }
    const expectedUrl = `${DRIVE_API}/files/${encodeURIComponent(entry.fileId)}?${params}`;
    const body = entry.action === 'trash' ? '{"trashed":true}' : '{}';
    if (url !== expectedUrl || options.method !== 'PATCH' || options.body !== body
      || options.driveNoRetry !== true || options.signal !== owner.options.signal || options.signal.aborted) deny();
    const permit = Object.freeze({});
    const abort = () => release(permit);
    const headers = JSON.stringify(Object.entries(options.headers || {}).sort());
    issued.set(permit, { scope, owner, entry, target, url, body, headers, signal: options.signal, abort, expires: Date.now() + 5_000 });
    scope.permits.add(permit);
    options.signal.addEventListener('abort', abort, { once: true });
    return permit;
  }
  function release(permit) {
    const record = issued.get(permit);
    if (record) {
      record.scope.permits.delete(permit);
      record.signal.removeEventListener('abort', record.abort);
    }
    issued.delete(permit);
  }
  function consume(permit, url, options) {
    const record = permit && issued.get(permit);
    if (!record) deny();
    release(permit); // Failed, duplicated, or expired dispatches never regain authority.
    assert(record.scope); record.owner.assert();
    validate(record.scope, record.entry.before);
    if (record.target) validate(record.scope, record.target, true);
    if (Date.now() >= record.expires || url !== record.url || options.method !== 'PATCH'
      || options.body !== record.body || options.driveNoRetry !== true
      || JSON.stringify(Object.entries(options.headers || {}).sort()) !== record.headers
      || options.signal !== record.signal || options.signal.aborted
      || options[ACCOUNT_STATE_WRITE] !== undefined || options[ACCOUNT_STATE_READ] !== undefined) deny();
    return true;
  }
  function confirmed(scope, entry) {
    assert(scope);
    if (entry.state !== 'confirmed' || !scope.files.has(entry.fileId)) deny();
    const value = ledger(scope), row = value.created.find(item => item.id === entry.fileId);
    const after = entry.after;
    if (!row || after?.id !== row.id || after.ownedByMe !== true || after.driveId || !after.version
      || after.appProperties?.qaRun !== scope.run || after.appProperties?.qaRole !== row.role
      || after.mimeType !== row.metadata.mimeType || !driveMutationMatches(entry, after)) deny();
    row.metadata = after;
    try { localStorage.setItem(scope.key, JSON.stringify(value)); }
    catch (_) { throw driveMutationError('uncertain', '일회용 검증 파일의 확인 기록을 저장하지 못했습니다.'); }
  }
  return Object.freeze({ activate, select, validate, checkFolders, issue, consume, release, confirmed });
})();

function activateDisposableDriveMutationLease(options) {
  return disposableDriveMutations.activate(options);
}

function driveMutationError(mutationState, message, status = 0) {
  return Object.assign(new Error(message), { mutationState, status });
}

function captureDriveMutationOwner() {
  const base = captureAccountStateRequest();
  const accountKey = state.authAccountKey;
  const accountId = state.accountId;
  const current = () => base.current() && Boolean(accountKey && accountId)
    && state.authAccountKey === accountKey && state.accountId === accountId && !state.accountIdentityPending && !state.demo;
  const assert = () => {
    if (!current()) throw new DOMException('Drive mutation account changed', 'AbortError');
  };
  assert();
  return { ...base, accountKey, accountId, current, assert,
    prefix: `${DRIVE_MUTATION_PREFIX}${encodeURIComponent(accountKey)}.${encodeURIComponent(accountId)}.` };
}

function readDriveMutations(owner) {
  const entries = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(owner.prefix)) continue;
      const row = JSON.parse(localStorage.getItem(key));
      if (row?.schema !== 1 || row.accountKey !== owner.accountKey || row.accountId !== owner.accountId
        || !row.operationId || key !== owner.prefix + encodeURIComponent(row.operationId)
        || !row.fileId || !['trash', 'move'].includes(row.action) || typeof row.intent !== 'string') throw new Error('Invalid ledger');
      entries.push(row);
    }
    return entries;
  } catch (_) {
    throw driveMutationError('uncertain', '이전 작업 기록을 읽지 못했습니다. 다시 연결해 확인해 주세요.');
  }
}

function persistDriveMutation(entry, owner, nextState) {
  // Origin ownership is immutable even if a response arrives after switching
  // accounts. No token, file name or media body is retained here.
  entry.state = nextState;
  entry.updatedAt = Date.now();
  if (nextState === 'confirmed' && !entry.confirmedAt) {
    entry.confirmedAt = entry.updatedAt;
    entry.confirmedAfter = entry.after;
  }
  const compactMetadata = value => value ? { id: value.id, parents: value.parents,
    trashed: value.trashed, version: value.version, driveId: value.driveId } : null;
  const stored = { ...entry, before: compactMetadata(entry.before), after: compactMetadata(entry.after),
    confirmedAfter: compactMetadata(entry.confirmedAfter) };
  try {
    localStorage.setItem(owner.prefix + encodeURIComponent(entry.operationId), JSON.stringify(stored));
  } catch (_) {
    throw driveMutationError('uncertain', '작업 기록을 저장하지 못했습니다. 저장 공간을 확인해 주세요.');
  }
}

function driveMutationMetadata(value, id, { rootAlias = false } = {}) {
  // A destination (including shared-drive roots) need not itself have parents.
  // Ordinary selected-file pre/post metadata must still contain them.
  if (rootAlias && value?.mimeType === 'application/vnd.google-apps.folder' && value.parents == null) {
    value = { ...value, parents: [] };
  }
  if (!value || (value.id !== id && !(rootAlias && id === 'root' && typeof value.id === 'string' && value.id))
    || typeof value.trashed !== 'boolean' || !Array.isArray(value.parents)
    || value.parents.some(parent => typeof parent !== 'string' || !parent)) {
    throw driveMutationError('uncertain', 'Drive의 파일 상태를 확인하지 못했습니다.');
  }
  return { id: value.id, parents: [...value.parents].sort(), trashed: value.trashed,
    version: typeof value.version === 'string' ? value.version : null,
    driveId: value.driveId || null, mimeType: value.mimeType || '',
    ownedByMe: value.ownedByMe === true, appProperties: { ...(value.appProperties || {}) },
    resourceKey: value.resourceKey || '', capabilities: value.capabilities || {} };
}

async function readDriveMutationMetadata(file, owner, { rootAlias = false } = {}) {
  owner.assert();
  const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
  const resourceKeys = buildResourceKeysHeader([file]);
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params}`, {
    ...owner.options, driveMaxRateAttempts: 1,
    headers: resourceKeys ? { 'X-Goog-Drive-Resource-Keys': resourceKeys } : {}
  });
  const metadata = driveMutationMetadata(await response.json(), file.id, { rootAlias });
  owner.assert();
  return metadata;
}

function driveMutationMatches(entry, metadata) {
  return entry.action === 'trash' ? metadata.trashed === true
    : !metadata.trashed && metadata.parents.length === 1 && metadata.parents[0] === entry.targetId;
}

function driveMutationPreStateMatches(before, after) {
  return Boolean(before && after) && before.trashed === after.trashed && before.driveId === after.driveId
    && JSON.stringify(before.parents) === JSON.stringify(after.parents)
    && (before.version == null || before.version === after.version);
}

async function verifyDriveMutation(entry, owner) {
  // A failed fresh read must not authorize retry using a prior observation.
  // Historical success remains separately immutable in confirmedAfter.
  entry.after = null;
  persistDriveMutation(entry, owner, 'verifying');
  try {
    const after = await readDriveMutationMetadata({ id: entry.fileId, resourceKey: entry.resourceKey }, owner);
    entry.after = after;
    if (driveMutationMatches(entry, after)) persistDriveMutation(entry, owner, 'confirmed');
    else if (!driveMutationPreStateMatches(entry.before, after)) persistDriveMutation(entry, owner, 'conflict');
    else persistDriveMutation(entry, owner, entry.rejectionStatus ? 'failed' : 'uncertain');
  } catch (error) {
    // 404, an unreadable body and account loss are not deletion proof.
    persistDriveMutation(entry, owner, 'uncertain');
  }
  return entry;
}

function driveMutationResult(entry) {
  if (entry.state !== 'confirmed') {
    const message = entry.state === 'conflict' ? '파일 상태가 바뀌었습니다. 새로고침해 확인해 주세요.'
      : entry.state === 'failed' ? 'Drive가 작업을 거절했습니다.' : '작업 결과를 확인 중입니다. 다시 누르면 먼저 결과를 확인합니다.';
    throw Object.assign(driveMutationError(entry.state, message, entry.rejectionStatus || 0), { operationId: entry.operationId });
  }
  return { skipped: Boolean(entry.skipped), metadata: entry.after, operationId: entry.operationId };
}

async function withDriveMutationLock(owner, task) {
  if (!navigator.locks?.request) throw driveMutationError('failed', '안전한 파일 작업을 지원하는 최신 브라우저에서 다시 시도해 주세요.');
  return navigator.locks.request(`${owner.prefix}lock`, async () => {
    owner.assert();
    const controller = new AbortController();
    const abort = () => controller.abort();
    owner.options.signal.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(abort, 60_000);
    const boundedOwner = { ...owner, options: { signal: controller.signal }, assert() {
      owner.assert();
      if (controller.signal.aborted) throw new DOMException('Drive operation timed out', 'AbortError');
    } };
    try { return await task(boundedOwner); }
    finally { clearTimeout(timer); owner.options.signal.removeEventListener('abort', abort); }
  });
}

async function executeDriveMutation(file, action, targetRow = null, { operationId = null, retryUnchanged = false } = {}) {
  if (!['trash', 'move'].includes(action) || typeof file?.id !== 'string' || !file.id
    || (action === 'move' && (typeof targetRow?.id !== 'string' || !targetRow.id))) {
    throw driveMutationError('failed', '작업할 파일과 폴더를 다시 선택해 주세요.');
  }
  // Freeze intent inputs before the first asynchronous boundary. Background
  // listing refresh must not silently change an already requested pre-state.
  file = { ...file, parents: Array.isArray(file.parents) ? [...file.parents] : undefined };
  targetRow = targetRow ? { ...targetRow } : null;
  const owner = captureDriveMutationOwner();
  const disposableScope = !DRIVE_MUTATIONS_ENABLED ? disposableDriveMutations.select(owner, file, action, targetRow) : null;
  const intent = JSON.stringify({ fileId: file.id, action, target: targetRow?.id || null,
    expectedParents: Array.isArray(file.parents) ? [...file.parents].sort() : null, expectedVersion: file.version || null });
  return withDriveMutationLock(owner, async (boundedOwner) => {
    const entries = readDriveMutations(owner);
    const duplicate = operationId && entries.find(row => row.operationId === operationId);
    if (duplicate && duplicate.intent !== intent) throw driveMutationError('conflict', '같은 작업 번호에 다른 요청을 보낼 수 없습니다.');
    const pending = entries.find(row => row.fileId === file.id && DRIVE_MUTATION_PENDING.has(row.state));
    let retryEntry = null;
    if (duplicate || pending) {
      const existing = duplicate || pending;
      if (existing.state === 'prepared') persistDriveMutation(existing, owner, 'cancelled-before-submit');
      else if (DRIVE_MUTATION_PENDING.has(existing.state) || existing.state === 'confirmed') await verifyDriveMutation(existing, boundedOwner);
      if (existing.intent !== intent) throw driveMutationError('conflict', '이전 작업 결과를 확인했습니다. 현재 상태에서 다시 선택해 주세요.');
      // Only a new explicit UI action may retry an unknown submission, after
      // this fresh GET proves the exact original version/state is unchanged.
      // Recovery and duplicate operation-ID calls remain strictly read-only.
      if (!operationId && retryUnchanged && existing.state === 'uncertain'
        && existing.before?.version && driveMutationPreStateMatches(existing.before, existing.after)) retryEntry = existing;
      else return driveMutationResult(existing);
    }
    const entry = retryEntry || { schema: 1, operationId: operationId || globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      accountKey: owner.accountKey, accountId: owner.accountId, fileId: file.id, action, intent,
      resourceKey: file.resourceKey || '', targetId: targetRow?.id || null, before: null, rejectionStatus: 0 };
    if (!retryEntry) persistDriveMutation(entry, owner, 'prepared');
    try {
      const before = await readDriveMutationMetadata(file, boundedOwner);
      if (retryEntry && !driveMutationPreStateMatches(entry.before, before)) {
        persistDriveMutation(entry, owner, 'conflict');
        throw driveMutationError('conflict', '파일 상태가 바뀌었습니다. 새로고침해 주세요.');
      }
      entry.before = before;
      if (disposableScope) disposableDriveMutations.validate(disposableScope, before);
      entry.resourceKey = before.resourceKey || entry.resourceKey;
      if ((file.version && file.version !== before.version)
        || (Array.isArray(file.parents) && JSON.stringify([...file.parents].sort()) !== JSON.stringify(before.parents))) {
        throw driveMutationError('conflict', '파일 위치 또는 버전이 바뀌었습니다. 새로고침해 주세요.');
      }
      let target = null;
      if (action === 'move') {
        target = await readDriveMutationMetadata(targetRow, boundedOwner, { rootAlias: true });
        entry.targetId = target.id;
        if (disposableScope) disposableDriveMutations.validate(disposableScope, target, true);
        if (target.mimeType !== 'application/vnd.google-apps.folder' || target.trashed || target.capabilities.canAddChildren !== true || before.trashed) {
          throw driveMutationError('failed', '이 폴더로 이동할 권한이나 상태를 확인하지 못했습니다.', 403);
        }
      }
      if (disposableScope) await disposableDriveMutations.checkFolders(disposableScope, boundedOwner, before, target);
      if (driveMutationMatches(entry, before)) {
        entry.skipped = true; entry.after = before;
        persistDriveMutation(entry, owner, 'confirmed');
        return driveMutationResult(entry);
      }
      const moveCapability = normalizedDriveId(before) === normalizedDriveId(target) ? 'canMoveItemWithinDrive' : 'canMoveItemOutOfDrive';
      if (before.capabilities[action === 'trash' ? 'canTrash' : moveCapability] !== true) {
        throw driveMutationError('failed', '파일을 변경할 권한이 없습니다.', 403);
      }
      const params = new URLSearchParams({ supportsAllDrives: 'true', fields: DRIVE_MUTATION_FIELDS });
      if (action === 'move') {
        params.set('addParents', entry.targetId);
        params.set('removeParents', before.parents.join(','));
      }
      const resourceKeys = buildResourceKeysHeader([before, target, ...state.moveFolderRows.filter(row => before.parents.includes(row.id))]);
      const headers = { 'Content-Type': 'application/json' };
      if (resourceKeys) headers['X-Goog-Drive-Resource-Keys'] = resourceKeys;
      boundedOwner.assert();
      entry.attempts = (entry.attempts || 0) + 1;
      entry.rejectionStatus = 0;
      persistDriveMutation(entry, owner, 'submitted');
      try {
        // No transparent auth/rate-limit PATCH retries: every possible send is
        // followed by an independent read before any later user intent.
        const url = `${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params}`;
        const options = {
          ...boundedOwner.options, driveNoRetry: true, method: 'PATCH', headers,
          body: action === 'trash' ? JSON.stringify({ trashed: true }) : '{}'
        };
        const permit = disposableScope ? disposableDriveMutations.issue(disposableScope, boundedOwner, entry, target, url, options) : null;
        try {
          if (permit) options[DISPOSABLE_DRIVE_MUTATION] = permit;
          const response = await driveFetch(url, options);
          await response.json();
        } finally { if (permit) disposableDriveMutations.release(permit); }
      } catch (error) {
        if ([400, 401, 403, 404, 409, 412, 429].includes(error?.status)) entry.rejectionStatus = error.status;
      }
      await verifyDriveMutation(entry, boundedOwner);
      if (disposableScope && entry.state === 'confirmed') disposableDriveMutations.confirmed(disposableScope, entry);
      return driveMutationResult(entry);
    } catch (error) {
      if (entry.state === 'prepared') {
        persistDriveMutation(entry, owner,
          error?.name === 'AbortError' ? 'cancelled-before-submit' : error.mutationState === 'conflict' ? 'conflict' : 'failed');
        error.mutationState = entry.state;
      }
      if (DRIVE_MUTATION_PENDING.has(entry.state)) error.mutationState = 'uncertain';
      throw error;
    }
  });
}

async function recoverDriveMutations({ notifyResult = false } = {}) {
  if (state.demo || !state.authAccountKey || !state.accountId || state.accountIdentityPending || !navigator.locks?.request) return;
  const owner = captureDriveMutationOwner();
  return withDriveMutationLock(owner, async boundedOwner => {
    const entries = readDriveMutations(owner);
    let unresolved = 0;
    let confirmed = 0;
    let failed = 0;
    for (const entry of entries) {
      boundedOwner.assert();
      if (entry.state === 'prepared') persistDriveMutation(entry, owner, 'cancelled-before-submit');
      else if (DRIVE_MUTATION_PENDING.has(entry.state)) {
        await verifyDriveMutation(entry, boundedOwner);
        if (entry.state !== 'confirmed' && entry.state !== 'failed') unresolved++;
        else if (entry.state === 'confirmed') confirmed++;
        else failed++;
      }
    }
    if (owner.current() && unresolved) showToast(`${unresolved}개 파일 작업을 확인 중입니다. 새로고침하면 다시 확인합니다.`);
    else if (owner.current() && notifyResult && confirmed + failed) showToast(`이전 작업: ${confirmed}개 확인됨, ${failed}개 실패`);
  }).catch(error => {
    if (owner.current() && error?.name !== 'AbortError') showToast(error.message || '이전 파일 작업의 결과를 확인하지 못했습니다.');
    throw error;
  });
}

function summarizeDriveMutationFailures(results) {
  const counts = { failed: 0, uncertain: 0, conflict: 0, cancelled: 0 };
  for (const result of results) {
    const status = result.reason?.mutationState;
    if (status === 'uncertain' || status === 'submitted' || status === 'verifying') counts.uncertain++;
    else if (status === 'conflict') counts.conflict++;
    else if (status === 'cancelled-before-submit' || result.reason?.name === 'AbortError') counts.cancelled++;
    else counts.failed++;
  }
  return [[counts.failed, '실패'], [counts.uncertain, '확인 중'], [counts.conflict, '다시 확인'], [counts.cancelled, '취소']]
    .filter(([count]) => count).map(([count, label]) => `${count.toLocaleString('ko-KR')}개 ${label}`).join(', ');
}

async function trashDriveFile(file, options) {
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return;
  }
  return executeDriveMutation(file, 'trash', null, options);
}

async function performDeleteFile() {
  const files = actionFilesSnapshot();
  if (!files.length || state.deleting || state.bulkAction) return;
  const owner = captureAccountStateRequest();
  state.deleting = true;
  state.bulkAction = true;
  updateSelectionUI();
  if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = true;
  setButtonLoading(el.deleteConfirmButton, true, files.length > 1 ? `${files.length}개 삭제 중…` : '삭제 중…');
  try {
    const order = getPlaybackFileList();
    const currentId = state.selected?.id || null;
    const removedIndex = currentId ? order.findIndex((file) => file.id === currentId) : -1;
    const results = await runTaskPool(files, async (file) => {
      owner.assert();
      return trashDriveFile(file, { retryUnchanged: true });
    });
    owner.assert();
    const succeeded = results.filter((result) => result.status === 'fulfilled').map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const removedIds = new Set(succeeded.map((file) => file.id));
    if (removedIds.size) invalidateLibraryNavigationData();

    state.files = state.files.filter((file) => !removedIds.has(file.id));
    markFilesRemovedFromAccountState(removedIds);
    succeeded.forEach((file) => {
      shuffledOrderMap.delete(file.id);
      generatedThumbnailCache.delete(file.id);
    });
    if (state.treeCache) {
      state.treeCache = buildTreeIndexes(state.treeCache.items.filter((file) => !removedIds.has(file.id)), state.treeCache.scannedFolderIds);
    }
    if (el.deleteDialog?.open) el.deleteDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();

    settleSelectionAfterBulk(failed.map((result) => result.item));
    if (currentId && removedIds.has(currentId)) playNextAfterRemoval(order, removedIndex, removedIds);

    if (!failed.length) {
      const suffix = state.demo ? ' (데모 시뮬레이션)' : ' Drive 휴지통에서 복구할 수 있습니다.';
      showToast(`${succeeded.length.toLocaleString('ko-KR')}개 파일을 휴지통으로 이동했습니다.${suffix}`);
    } else {
      const firstError = failed[0]?.reason;
      failed.forEach(result => clearRejectedToken(result.reason));
      showToast(`${succeeded.length.toLocaleString('ko-KR')}개 휴지통 이동, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(firstError)}`);
    }
  } catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    reportAppFailure('bulk-delete', error);
    if (el.deleteDialog?.open) el.deleteDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearRejectedToken(error);
    }
    showToast(`삭제하지 못했습니다: ${humanizeDriveError(error)}`);
  } finally {
    state.deleting = false;
    state.bulkAction = false;
    if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = false;
    setButtonLoading(el.deleteConfirmButton, false);
    updateSelectionUI();
  }
}

/* 삭제/이동으로 현재 파일이 목록에서 사라져도 플레이어를 유지하고
   다음 영상을 자동 재생한다. 남은 파일이 없을 때만 플레이어를 닫는다. */
function playNextAfterRemoval(order, removedIndex, removedIdOrIds) {
  if (el.playerSheet.hidden) return;
  const removedIds = removedIdOrIds instanceof Set ? removedIdOrIds : new Set([removedIdOrIds]);
  let next = null;
  for (let i = removedIndex + 1; i < order.length; i++) {
    if (!removedIds.has(order[i].id)) { next = order[i]; break; }
  }
  if (!next) {
    const remaining = order.filter((file) => !removedIds.has(file.id));
    next = remaining[0] || null;
  }
  if (!next) {
    closePlayer();
    return;
  }
  state.pendingPlay = true;
  animateMediaTransition('left', () => openMediaSource(next));
}

/* 폴더 이동 — 최근 이동 폴더와 서버 검색은 바로 보이고, 전체 폴더 목록은 뒤에서 1회 수집한다 */
async function requestMoveFile() {
  const files = getActionFiles();
  if (!files.length || state.moving || state.bulkAction) return;
  const generation = ++moveRequestGeneration;
  moveParentsAbortController?.abort();
  const parentsController = new AbortController();
  moveParentsAbortController = parentsController;
  state.pendingActionFiles = [...files];
  state.moveTargetFolderId = null;
  state.moveResultLimit = MOVE_RESULT_BATCH;
  resetMoveFolderSearch();
  if (el.moveFileName) el.moveFileName.textContent = formatActionTarget(files);
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  if (el.moveSearchInput) el.moveSearchInput.value = '';
  if (el.moveDialog && !el.moveDialog.open) el.moveDialog.showModal();
  renderMoveFolderList('');
  try {
    const parentResults = await runTaskPool(files, (file) => ensureFileParents(file, parentsController.signal));
    if (generation !== moveRequestGeneration || parentsController.signal.aborted) {
      throw new DOMException('Move request superseded', 'AbortError');
    }
    const parentFailure = parentResults.find((result) => result.status === 'rejected');
    if (parentFailure) throw parentFailure.reason;
    // Known parents mark a remembered folder as 현재 위치 before the index arrives.
    if (el.moveDialog?.open) renderMoveFolderList(el.moveSearchInput?.value || '');
    await ensureFolderIndex();
    if (generation !== moveRequestGeneration || parentsController.signal.aborted) {
      throw new DOMException('Move request superseded', 'AbortError');
    }
    if (el.moveDialog?.open) renderMoveFolderList(el.moveSearchInput?.value || '');
  } catch (error) {
    if (generation !== moveRequestGeneration || parentsController.signal.aborted || error?.name === 'AbortError') return;
    reportAppFailure('move-dialog', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    state.pendingActionFiles = [];
    if (error?.status === 401) {
      clearRejectedToken(error);
      showToast('Google 인증이 만료됐습니다. 다시 시도해 주세요.');
    } else {
      showToast(`폴더 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    if (moveParentsAbortController === parentsController) moveParentsAbortController = null;
  }
}

async function ensureFileParents(file, signal) {
  if (!file) return;
  if (signal?.aborted) throw new DOMException('Move request cancelled', 'AbortError');
  if (Array.isArray(file.parents) && file.parents.length && file.capabilities) return;
  if (state.demo) {
    file.parents = ['root'];
    return;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?fields=parents,driveId,resourceKey,capabilities(canMoveItemOutOfDrive,canMoveItemWithinDrive)&supportsAllDrives=true`, { signal });
  const data = await response.json();
  if (signal?.aborted) throw new DOMException('Move request cancelled', 'AbortError');
  file.parents = Array.isArray(data.parents) && data.parents.length ? data.parents : [state.rootFolderId || 'root'];
  file.driveId = data.driveId || null;
  file.resourceKey = data.resourceKey || file.resourceKey || null;
  file.capabilities = { ...(file.capabilities || {}), ...(data.capabilities || {}) };
}

function cancelMoveFolderLoading() {
  moveRequestGeneration += 1;
  moveParentsAbortController?.abort();
  moveParentsAbortController = null;
  state.folderIndexAbortController?.abort();
  state.folderIndexAbortController = null;
  state.folderIndexPromise = null;
  state.loadingFolderIndex = false;
  state.moveTargetFolderId = null;
  state.pendingActionFiles = [];
  resetMoveFolderSearch();
}

/* 최근 이동 폴더 — 계정별로 마지막 대상 몇 개를 기억해 전체 목록을 받기 전에도 바로 고르게 한다.
   권한은 저장하지 않는다: 실제 이동은 대상 폴더 메타데이터를 다시 읽어 확인한다. */
function moveRecentStorageKey() {
  if (state.demo) return `${MOVE_RECENT_PREFIX}demo`;
  if (!state.accountId || state.accountIdentityPending) return '';
  return `${MOVE_RECENT_PREFIX}${encodeURIComponent(state.accountId)}`;
}

function readRecentMoveFolders() {
  const key = moveRecentStorageKey();
  if (!key) return [];
  try {
    const stored = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(stored)) return [];
    return stored
      .filter((item) => typeof item?.id === 'string' && /^[A-Za-z0-9_-]{1,200}$/.test(item.id) && typeof item.name === 'string')
      .slice(0, MOVE_RECENT_LIMIT)
      .map((item) => ({
        id: item.id,
        name: item.name,
        driveId: typeof item.driveId === 'string' ? item.driveId : null,
        resourceKey: typeof item.resourceKey === 'string' ? item.resourceKey : null,
        isRoot: item.isRoot === true
      }));
  } catch (_) {
    return [];
  }
}

function rememberRecentMoveFolder(row) {
  const key = moveRecentStorageKey();
  if (!key || !row?.id) return;
  const entry = {
    id: row.id,
    name: String(row.name || ''),
    driveId: row.driveId || null,
    resourceKey: row.resourceKey || null,
    isRoot: row.isRoot === true
  };
  const next = [entry, ...readRecentMoveFolders().filter((item) => item.id !== row.id)].slice(0, MOVE_RECENT_LIMIT);
  try { localStorage.setItem(key, JSON.stringify(next)); } catch (_) {}
}

// Once the full index exists its rows carry fresh capabilities, and a
// remembered folder that is no longer in Drive drops out of the list.
function recentMoveRows() {
  const recent = readRecentMoveFolders();
  if (!state.folderIndex) return recent.map((item) => ({ ...item, depth: 0 }));
  const byId = new Map(state.moveFolderRows.map((row) => [row.id, row]));
  return recent.map((item) => byId.get(item.id)).filter(Boolean).map((row) => ({ ...row, depth: 0 }));
}

function findMoveTargetRow(id) {
  if (!id) return null;
  return state.moveFolderRows.find((row) => row.id === id)
    || state.moveSearch?.rows?.find((row) => row.id === id)
    || recentMoveRows().find((row) => row.id === id)
    || null;
}

function normalizeMoveFilter(value) {
  return String(value || '').trim().toLocaleLowerCase('ko');
}

function moveRowMatches(row, filter) {
  return String(row?.name || '').toLocaleLowerCase('ko').includes(filter);
}

function resetMoveFolderSearch() {
  clearTimeout(state.moveSearch?.timer);
  state.moveSearch?.controller?.abort();
  state.moveSearch = null;
}

function setMoveFolderLoadingText(text) {
  state.moveLoadingText = text;
  const note = el.moveFolderList?.querySelector?.('[data-move-loading]');
  if (note) note.textContent = text;
}

/* 서버 검색 — 전체 폴더 목록을 받는 동안 검색어는 Drive에 바로 물어본다.
   Drive의 name contains는 단어 앞부분만 맞추므로, 중간 글자 일치는 전체 목록이 끝나면 채워진다. */
async function searchMoveFoldersOnServer(query, signal) {
  if (state.demo) {
    await ensureTreeCache();
    return [...(state.treeCache?.foldersById?.values() || [])];
  }
  const params = new URLSearchParams({
    pageSize: '100',
    q: `trashed = false and mimeType = '${FOLDER_MIME}' and name contains '${escapeDriveQueryLiteral(query)}'`,
    corpora: 'allDrives',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'files(id,name,parents,driveId,resourceKey,capabilities(canAddChildren))'
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal });
  const data = await response.json();
  return Array.isArray(data.files) ? data.files : [];
}

function handleMoveSearchInput(value) {
  state.moveResultLimit = MOVE_RESULT_BATCH;
  const query = String(value || '').trim();
  const filter = normalizeMoveFilter(query);
  if (state.moveSearch?.filter !== filter) {
    resetMoveFolderSearch();
    if (filter && !state.folderIndex) {
      const search = { filter, status: 'pending', rows: [], controller: new AbortController(), timer: null };
      state.moveSearch = search;
      search.timer = setTimeout(() => { void runMoveFolderSearch(search, query); }, MOVE_SEARCH_DEBOUNCE_MS);
    }
  }
  renderMoveFolderList(value);
}

async function runMoveFolderSearch(search, query) {
  const current = () => state.moveSearch === search && !search.controller.signal.aborted;
  try {
    const folders = await searchMoveFoldersOnServer(query, search.controller.signal);
    if (!current()) return;
    search.rows = dedupeFiles(folders)
      .filter((folder) => moveRowMatches(folder, search.filter))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ko', { numeric: true }))
      .map((folder) => ({ ...folder, depth: 0 }));
    search.status = 'done';
  } catch (error) {
    if (!current() || error?.name === 'AbortError') return;
    // Auth and other failures surface through the full index load.
    search.status = 'error';
  }
  if (el.moveDialog?.open && !state.folderIndex) renderMoveFolderList(el.moveSearchInput?.value || '');
}

async function ensureFolderIndex() {
  if (state.folderIndex) return state.folderIndex;
  if (state.folderIndexPromise) return state.folderIndexPromise;
  state.loadingFolderIndex = true;
  state.moveLoadingText = '';
  const controller = new AbortController();
  state.folderIndexAbortController = controller;
  const promise = (async () => {
   try {
    const rootId = await resolveRootFolderId();
    if (state.demo) {
      await ensureTreeCache();
      const folders = [...(state.treeCache?.foldersById?.values() || [])];
      const roots = [{ id: rootId, name: '내 드라이브', driveId: null, capabilities: { canAddChildren: true } }];
      state.folderIndex = { roots, folders };
      state.moveFolderRows = buildMoveFolderRows(state.folderIndex);
      return state.folderIndex;
    }

    const [rootResponse, sharedDrives] = await Promise.all([
      driveFetch(`${DRIVE_API}/files/root?fields=id,name,driveId,resourceKey,capabilities(canAddChildren)&supportsAllDrives=true`, { signal: controller.signal }),
      collectSharedDriveRoots(controller.signal)
    ]);
    const rootData = await rootResponse.json();
    const root = {
      id: rootData.id || rootId,
      name: '내 드라이브',
      driveId: rootData.driveId || null,
      resourceKey: rootData.resourceKey || null,
      capabilities: rootData.capabilities || { canAddChildren: true }
    };
    const collected = await collectAllPages(async (pageToken) => {
      const params = new URLSearchParams({
        pageSize: String(DRIVE_PAGE_SIZE),
        q: `trashed = false and mimeType = '${FOLDER_MIME}'`,
        spaces: 'drive',
        corpora: 'user',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        fields: 'nextPageToken,incompleteSearch,files(id,name,parents,driveId,resourceKey,capabilities(canAddChildren))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal });
      return response.json();
    }, {
      signal: controller.signal,
      onPage: ({ count }) => {
        setMoveFolderLoadingText(`폴더 목록을 불러오는 중… ${count.toLocaleString('ko-KR')}개`);
      }
    });
    if (collected.incompleteSearch) {
      throw new Error('Google Drive가 폴더 검색 결과를 완전하게 반환하지 않았습니다. 잠시 후 다시 시도해 주세요.');
    }
    const sharedDriveFolders = await collectSharedDriveFolders(sharedDrives, controller.signal);
    const roots = [root, ...sharedDrives];
    state.folderIndex = { roots, folders: dedupeFiles([...collected.items, ...sharedDriveFolders]) };
    state.moveFolderRows = buildMoveFolderRows(state.folderIndex);
    return state.folderIndex;
  } finally {
    if (state.folderIndexAbortController === controller) {
      state.loadingFolderIndex = false;
      state.folderIndexAbortController = null;
    }
  }
  })();
  state.folderIndexPromise = promise;
  try {
    return await promise;
  } finally {
    if (state.folderIndexPromise === promise) state.folderIndexPromise = null;
  }
}

async function collectSharedDriveRoots(signal) {
  const collected = await collectAllPages(async (pageToken) => {
    const params = new URLSearchParams({
      pageSize: '100',
      fields: 'nextPageToken,drives(id,name,capabilities(canAddChildren,canListChildren))'
    });
    if (pageToken) params.set('pageToken', pageToken);
    const response = await driveFetch(`${DRIVE_API}/drives?${params.toString()}`, { signal });
    const data = await response.json();
    return { items: data.drives || [], nextPageToken: data.nextPageToken };
  }, { signal });
  return collected.items.map((drive) => ({
    id: drive.id,
    name: drive.name || '이름 없는 공유 드라이브',
    driveId: drive.id,
    capabilities: drive.capabilities || {},
    isSharedDrive: true
  }));
}

async function collectSharedDriveFolders(sharedDrives, signal) {
  const drives = (Array.isArray(sharedDrives) ? sharedDrives : [])
    .filter((drive) => drive?.id && drive.capabilities?.canListChildren !== false);
  if (!drives.length) return [];
  const results = new Array(drives.length);
  let cursor = 0;
  let collectedCount = 0;
  const worker = async () => {
    while (cursor < drives.length) {
      const index = cursor++;
      const drive = drives[index];
      const collected = await collectAllPages(async (pageToken) => {
        const params = new URLSearchParams({
          pageSize: String(DRIVE_PAGE_SIZE),
          q: `trashed = false and mimeType = '${FOLDER_MIME}'`,
          spaces: 'drive',
          corpora: 'drive',
          driveId: drive.id,
          supportsAllDrives: 'true',
          includeItemsFromAllDrives: 'true',
          fields: 'nextPageToken,incompleteSearch,files(id,name,parents,driveId,resourceKey,capabilities(canAddChildren))'
        });
        if (pageToken) params.set('pageToken', pageToken);
        const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal });
        return response.json();
      }, { signal });
      if (collected.incompleteSearch) {
        throw new Error(`공유 드라이브 "${drive.name}"의 폴더 검색 결과가 완전하지 않습니다.`);
      }
      results[index] = collected.items;
      collectedCount += collected.items.length;
      setMoveFolderLoadingText(`공유 드라이브 폴더 확인 중… ${collectedCount.toLocaleString('ko-KR')}개`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(2, drives.length) }, () => worker()));
  return results.flat();
}

/* 실제 루트 폴더 ID 해소 — Drive API v3에서 'root' 별칭을 실제 ID로 변환한다.
   about?fields=rootFolderId는 v3에 존재하지 않으므로
   GET /files/root?fields=id 엔드포인트를 사용한다. */
async function resolveRootFolderId() {
  if (state.demo) {
    state.rootFolderId = state.rootFolderId || 'root';
    return state.rootFolderId;
  }
  if (state.rootFolderId && state.rootFolderId !== 'root') return state.rootFolderId;
  try {
    const response = await driveFetch(`${DRIVE_API}/files/root?fields=id`);
    const data = await response.json();
    if (data.id) {
      state.rootFolderId = data.id;
      return data.id;
    }
  } catch (err) {
    if (err?.name === 'AbortError' || err?.status === 401) throw err;
    reportAppFailure('root-folder-resolution', err, 'warn');
  }
  if (!state.rootFolderId) state.rootFolderId = 'root';
  return state.rootFolderId;
}

function renderMoveFolderList(filterRaw) {
  if (!el.moveFolderList) return;
  el.moveFolderList.replaceChildren();
  const filter = normalizeMoveFilter(filterRaw);
  const files = actionFilesSnapshot();
  const fragment = document.createDocumentFragment();
  const appendNote = (text, { loading = false, compact = false } = {}) => {
    const note = document.createElement('div');
    note.className = compact ? 'move-folder-empty compact' : 'move-folder-empty';
    if (loading) note.dataset.moveLoading = '';
    note.textContent = text;
    fragment.appendChild(note);
  };
  const appendHeading = (text) => {
    const heading = document.createElement('div');
    heading.className = 'move-folder-section';
    heading.textContent = text;
    fragment.appendChild(heading);
  };
  const appendRows = (rows) => rows.forEach((row) => fragment.appendChild(createMoveFolderRow(row, files)));
  const loadingText = state.moveLoadingText || '폴더 목록을 불러오는 중…';

  if (!state.folderIndex) {
    const recent = recentMoveRows();
    if (!filter) {
      if (recent.length) {
        appendHeading('최근 이동한 폴더');
        appendRows(recent);
      }
      appendNote(loadingText, { loading: true, compact: recent.length > 0 });
    } else {
      const search = state.moveSearch?.filter === filter ? state.moveSearch : null;
      const seen = new Set();
      const rows = [...recent.filter((row) => moveRowMatches(row, filter)), ...(search?.rows || [])]
        .filter((row) => !seen.has(row.id) && seen.add(row.id));
      appendRows(rows);
      if (!search || search.status === 'pending') appendNote('검색 중…', { compact: rows.length > 0 });
      else if (search.status === 'error') appendNote(`검색하지 못했습니다. ${loadingText}`, { loading: true, compact: rows.length > 0 });
      else if (!rows.length) appendNote(`아직 일치하는 폴더가 없습니다. ${loadingText}`, { loading: true });
      else appendNote(loadingText, { loading: true, compact: true });
    }
    el.moveFolderList.appendChild(fragment);
    return;
  }

  const filtered = filter
    ? state.moveFolderRows.filter((row) => moveRowMatches(row, filter))
    : state.moveFolderRows;
  if (!filtered.length) {
    appendNote('일치하는 폴더가 없습니다.');
    el.moveFolderList.appendChild(fragment);
    return;
  }
  const recent = filter ? [] : recentMoveRows();
  if (recent.length) {
    appendHeading('최근 이동한 폴더');
    appendRows(recent);
    appendHeading('모든 폴더');
  }
  appendRows(filtered.slice(0, state.moveResultLimit));
  el.moveFolderList.appendChild(fragment);
  if (filtered.length > state.moveResultLimit) {
    const more = document.createElement('button');
    more.type = 'button';
    more.className = 'move-folder-more';
    more.textContent = `폴더 ${Math.min(MOVE_RESULT_BATCH, filtered.length - state.moveResultLimit).toLocaleString('ko-KR')}개 더 보기`;
    more.addEventListener('click', () => {
      state.moveResultLimit += MOVE_RESULT_BATCH;
      renderMoveFolderList(filterRaw);
    });
    el.moveFolderList.appendChild(more);
  }
}

function createMoveFolderRow(row, files) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'move-folder-row';
  button.dataset.folderId = row.id;
  const selected = state.moveTargetFolderId === row.id;
  button.setAttribute('aria-pressed', String(selected));
  const blockReason = getBulkMoveBlockReason(files, row);
  if (blockReason === '현재 위치') button.classList.add('current');
  if (blockReason) button.disabled = true;
  if (selected) button.classList.add('selected');
  button.style.setProperty('--depth', String(row.depth || 0));

  const name = document.createElement('span');
  name.className = 'move-folder-name';
  name.textContent = row.name;
  button.appendChild(name);
  if (blockReason) {
    const badge = document.createElement('span');
    badge.className = 'move-folder-current';
    badge.textContent = blockReason;
    button.appendChild(badge);
  }
  // The same folder can appear under 최근 and in the tree; both show selection.
  button.addEventListener('click', () => {
    state.moveTargetFolderId = row.id;
    el.moveFolderList.querySelectorAll('.move-folder-row').forEach((item) => {
      const match = item.dataset.folderId === row.id;
      item.classList.toggle('selected', match);
      item.setAttribute('aria-pressed', String(match));
    });
    if (el.moveConfirmButton) el.moveConfirmButton.disabled = false;
  });
  return button;
}

function normalizedDriveId(item) {
  return item?.driveId || 'my-drive';
}

function getMoveBlockReason(file, targetRow, currentParents = []) {
  if (!targetRow?.id) return '선택 불가';
  if (currentParents.includes(targetRow.id)) return '현재 위치';
  if (targetRow.capabilities?.canAddChildren === false) return '읽기 전용';
  if (!file) return null;
  const crossesDrive = normalizedDriveId(file) !== normalizedDriveId(targetRow);
  if (crossesDrive && file.driveId && file.capabilities?.canMoveItemOutOfDrive === false) return '드라이브 간 이동 불가';
  if (!crossesDrive && file.capabilities?.canMoveItemWithinDrive === false) return '이동 권한 없음';
  return null;
}

function getBulkMoveBlockReason(files, targetRow) {
  const items = Array.isArray(files) ? files : [];
  let actionableCount = 0;
  for (const file of items) {
    const parents = Array.isArray(file.parents) && file.parents.length
      ? file.parents
      : [state.rootFolderId || 'root'];
    const reason = getMoveBlockReason(file, targetRow, parents);
    if (reason === '현재 위치') continue;
    if (reason) return reason;
    actionableCount++;
  }
  return actionableCount ? null : '현재 위치';
}

async function moveDriveFile(file, targetRow, options) {
  if (!state.demo) {
    const owner = captureDriveMutationOwner();
    const result = await executeDriveMutation(file, 'move', targetRow, options);
    owner.assert();
    // Only the independent GET may update local parents/capabilities.
    file.parents = [...result.metadata.parents];
    file.driveId = result.metadata.driveId;
    file.version = result.metadata.version;
    file.capabilities = { ...(file.capabilities || {}), ...result.metadata.capabilities };
    return result;
  }
  const target = targetRow.id;
  const currentParents = Array.isArray(file.parents) && file.parents.length
    ? file.parents
    : [state.rootFolderId || 'root'];
  if (currentParents.includes(target)) return { skipped: true };
  const blockReason = getMoveBlockReason(file, targetRow, currentParents);
  if (blockReason) {
    const error = new Error(blockReason);
    error.status = 403;
    throw error;
  }
  // Demo mode only: real moves returned above.
  await new Promise((resolve) => setTimeout(resolve, 180));
  file.parents = [target];
  return { skipped: false };
}

async function performMoveFile() {
  const files = actionFilesSnapshot();
  const targetRowId = state.moveTargetFolderId;
  if (!files.length || !targetRowId || state.moving || state.bulkAction) return;
  const owner = captureAccountStateRequest();
  const targetRow = findMoveTargetRow(targetRowId);
  const target = targetRow?.id;
  if (!target) {
    showToast('이동할 폴더를 다시 선택해 주세요.');
    return;
  }
  const blockReason = getBulkMoveBlockReason(files, targetRow);
  if (blockReason) {
    showToast(`이 폴더로 이동할 수 없습니다: ${blockReason}`);
    return;
  }
  state.moving = true;
  state.bulkAction = true;
  updateSelectionUI();
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  setButtonLoading(el.moveConfirmButton, true, files.length > 1 ? `${files.length}개 이동 중…` : '이동 중…');
  try {
    const order = getPlaybackFileList();
    const currentId = state.selected?.id || null;
    const removedIndex = currentId ? order.findIndex((file) => file.id === currentId) : -1;
    const results = await runTaskPool(files, async (file) => {
      owner.assert();
      return moveDriveFile(file, targetRow, { retryUnchanged: true });
    });
    owner.assert();
    const moved = results.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).map((result) => result.item);
    const skipped = results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).map((result) => result.item);
    const failed = results.filter((result) => result.status === 'rejected');
    const movedIds = new Set(moved.map((file) => file.id));
    if (movedIds.size) invalidateLibraryNavigationData();
    if (moved.length || skipped.length) rememberRecentMoveFolder(targetRow);

    if (!state.deepScan) state.files = state.files.filter((file) => !movedIds.has(file.id));
    moved.forEach((file) => shuffledOrderMap.delete(file.id));
    if (state.treeCache) state.treeCache = buildTreeIndexes(state.treeCache.items, state.treeCache.scannedFolderIds);
    if (el.moveDialog?.open) el.moveDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();

    settleSelectionAfterBulk(failed.map((result) => result.item));
    if (currentId && movedIds.has(currentId)) playNextAfterRemoval(order, removedIndex, movedIds);

    if (!failed.length) {
      const skippedText = skipped.length ? ` · ${skipped.length.toLocaleString('ko-KR')}개는 이미 해당 위치` : '';
      const demoText = state.demo ? ' (데모 시뮬레이션)' : '';
      showToast(`${moved.length.toLocaleString('ko-KR')}개 파일을 이동했습니다${skippedText}.${demoText}`);
    } else {
      failed.forEach(result => clearRejectedToken(result.reason));
      const skippedText = skipped.length ? `, ${skipped.length.toLocaleString('ko-KR')}개 이미 해당 위치` : '';
      showToast(`${moved.length.toLocaleString('ko-KR')}개 이동${skippedText}, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(failed[0]?.reason)}`);
      if (failed.some((result) => result.reason?.status === 403)) openPermissionGuide();
    }
  } catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    reportAppFailure('bulk-move', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    settleSelectionAfterBulk(files);
    if (error?.status === 401) {
      clearRejectedToken(error);
      showToast('Google 인증이 만료됐습니다. 다시 연결해 주세요.');
    } else if (error?.status === 403) {
      openPermissionGuide();
    } else {
      showToast(`이동하지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    state.moving = false;
    state.bulkAction = false;
    if (el.moveConfirmButton) el.moveConfirmButton.disabled = !state.moveTargetFolderId;
    setButtonLoading(el.moveConfirmButton, false);
    updateSelectionUI();
  }
}

function openPermissionGuide() {
  if (el.permissionDialog && !el.permissionDialog.open) el.permissionDialog.showModal();
}

