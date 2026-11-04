'use strict';

// Google preview and the background trash/move/rename jobs (Drive writes: drive-mutations.js;
// move destination picker: move-dialog.js).
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
  if (!files.length) return;
  state.pendingActionFiles = [...files];
  return performDeleteFile();
}

async function trashDriveFile(file, options) {
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return;
  }
  return executeDriveMutation(file, 'trash', null, options);
}

/* 뒤에서 도는 휴지통·이동·이름 바꾸기 — 확인하면 창을 바로 닫고 대상 파일을 목록과 재생 순서에서 숨긴다.
   휴지통·이동은 서버 큐(drive-jobs.js)에 넘겨서 앱을 닫아도 계속되고, 이름 바꾸기와 데모는 이 페이지에서 차례로 처리한다.
   진행 상황은 설정에서만 보여서 재생을 가리지 않고, 보낸 직후에는 되돌리기만 잠깐 뜬다. 끝나면 성공한 파일만 목록에서 빼고, 실패한 파일은 다시 보인다. */
const driveActionJobs = [];
let driveActionQueue = Promise.resolve();

// A job the server already holds survives closing the page, so only unsent work asks first.
function hasPendingDriveActions() {
  return driveActionJobs.some((job) => !job.submitted);
}

function setHiddenActionFiles(ids, hidden) {
  if (!ids.size) return;
  // A new Set identity invalidates the filtered-population cache.
  const next = new Set(state.hiddenActionFileIds);
  ids.forEach((id) => { if (hidden) next.add(id); else next.delete(id); });
  state.hiddenActionFileIds = next;
}

function renderLibraryAfterDriveAction() {
  if (libraryNavigation.restoring) return;
  if (state.deepScan && state.treeCache) computeAndRenderSubtree({ keepOrder: true });
  else renderFiles();
}

function queueDriveActionJob(job) {
  const ids = new Set(job.files.map((file) => file.id));
  const currentId = state.selected?.id || null;
  Object.assign(job, { ids, owner: captureAccountStateRequest(), done: 0, playerFollows: false });
  if (job.action !== 'rename') rememberDriveUndo(job, currentId);
  settleSelectionAfterBulk([]);
  collapseShortsExpand();
  if (job.hide) {
    setHiddenActionFiles(ids, true);
    renderFiles();
    if (currentId && ids.has(currentId)) playNextAfterRemoval(ids);
  } else {
    // A file that may stay in view keeps playing until its move is confirmed.
    job.playerFollows = Boolean(currentId && ids.has(currentId));
  }
  driveActionJobs.push(job);
  renderDriveJobPanel();
  if (job.action !== 'rename' && serverDriveJobsEnabled()) {
    job.submission = submitServerDriveJob(job);
    return job.submission;
  }
  const run = () => runDriveActionJob(job);
  driveActionQueue = driveActionQueue.then(run, run);
  return driveActionQueue;
}

async function runDriveActionJob(job) {
  const { owner } = job;
  const options = { retryUnchanged: true };
  try {
    const results = await runTaskPool(job.files, async (file) => {
      try {
        owner.assert();
        if (job.action === 'trash') return await trashDriveFile(file, options);
        if (job.action === 'rename') return await renameDriveFile(file, job.name, options);
        return await moveDriveFile(file, job.targetRow, options);
      } finally {
        job.done += 1;
        renderDriveJobPanel();
      }
    });
    // Another account or session owns the list now; its own listing is authoritative.
    if (!owner.current()) return;
    settleDriveActionResults(job, results);
  } catch (error) {
    if (!owner.current() || error?.name === 'AbortError') return;
    reportAppFailure(job.action === 'trash' ? 'bulk-delete' : job.action === 'rename' ? 'rename' : 'bulk-move', error);
    if (error?.status === 401) clearRejectedToken(error);
    const failure = { trash: '삭제하지', move: '이동하지', rename: '이름을 바꾸지' }[job.action];
    showToast(`${failure} 못했습니다: ${humanizeDriveError(error)}`);
  } finally {
    finishDriveActionJob(job);
  }
}

function settleDriveActionResults(job, results) {
  if (job.undone) return;
  if (job.reverse || job.action === 'untrash') settleUndoJob(job, results);
  else if (job.action === 'trash') settleTrashJob(job, results);
  else if (job.action === 'rename') settleRenameJob(job, results);
  else settleMoveJob(job, results);
}

function finishDriveActionJob(job) {
  const index = driveActionJobs.indexOf(job);
  if (index >= 0) driveActionJobs.splice(index, 1);
  serverDriveJobs.delete(job.id);
  setHiddenActionFiles(job.ids, false);
  renderDriveJobPanel();
  if (job.owner.current()) renderLibraryAfterDriveAction();
}

/* 되돌리기 — 휴지통·이동 직후 잠깐 아래에 뜬다. 보내지 않은 파일은 큐에서 빼고,
   이미 보낸 파일은 휴지통에서 꺼내거나 원래 폴더로 다시 옮긴다. 파일은 화면에 먼저 돌아온다. */
let driveUndoEntry = null;
let driveUndoTimer = null;

function rememberDriveUndo(job, currentId) {
  if (!state.demo && !serverDriveJobsEnabled()) return;
  clearTimeout(driveUndoTimer);
  const count = job.files.length;
  const what = count > 1 ? `${count.toLocaleString('ko-KR')}개를 ` : '';
  driveUndoEntry = { job, currentId,
    parents: new Map(job.files.map((file) => [file.id, Array.isArray(file.parents) ? [...file.parents] : []])),
    liked: job.files.filter((file) => isFavoriteFileId(file.id)).map((file) => file.id) };
  if (!el.driveUndoBar) return;
  el.driveUndoText.textContent = `${what}${job.action === 'trash' ? '휴지통' : `'${job.targetRow.name || '폴더'}'`}(으)로 보냈습니다.`
    .replace("휴지통(으)로", '휴지통으로');
  // Outside the fullscreen element nothing paints.
  (document.fullscreenElement || document.body).appendChild(el.driveUndoBar);
  el.driveUndoBar.hidden = false;
  driveUndoTimer = setTimeout(() => hideDriveUndo(), DRIVE_UNDO_MS);
}

function hideDriveUndo(job = null) {
  if (job && driveUndoEntry?.job !== job) return;
  clearTimeout(driveUndoTimer);
  driveUndoEntry = null;
  if (el.driveUndoBar) el.driveUndoBar.hidden = true;
}

function restoreUndoneFiles({ job, currentId, parents, liked }) {
  job.undone = true;
  setHiddenActionFiles(job.ids, false);
  job.ids = new Set();
  const addMissing = (files) => {
    const present = new Set(files.map((file) => file.id));
    return [...files, ...job.files.filter((file) => !present.has(file.id))];
  };
  job.files.forEach((file) => { if (parents.get(file.id)?.length) file.parents = [...parents.get(file.id)]; });
  state.files = addMissing(state.files);
  if (state.treeCache) {
    state.treeCache = buildTreeIndexes(addMissing(state.treeCache.items), state.treeCache.scannedFolderIds, state.treeCache.childListedIds);
  }
  liked.filter((id) => !isFavoriteFileId(id)).forEach((id) => setFavoriteFile(id, true));
  invalidateLibraryNavigationData();
  renderLibraryAfterDriveAction();
  const file = job.files.find((item) => item.id === currentId);
  if (file && el.playerSheet && !el.playerSheet.hidden && state.selected?.id !== file.id) {
    state.playbackDeck = retargetAccountPlaybackDeck(state.playbackDeck, file.id, getPlaybackFileList());
    state.pendingPlay = true;
    animateMediaTransition('right', () => openMediaSource(file));
  }
}

async function undoDriveAction() {
  const entry = driveUndoEntry;
  if (!entry) return;
  hideDriveUndo();
  const { job, parents } = entry;
  restoreUndoneFiles(entry);
  if (!job.server) return;
  await job.submission;
  try {
    await driveJobRequest('cancel', { jobId: job.id });
    const reverse = (action, files, targetRow = null) => {
      const undo = { action, files: files.map(({ id }) => ({ id })), targetRow, reverse: true, hide: false, ids: new Set(), done: 0, owner: job.owner };
      driveActionJobs.push(undo);
      return submitServerDriveJob(undo);
    };
    if (job.action === 'trash') await reverse('untrash', job.files);
    else {
      const homes = new Map();
      for (const file of job.files) {
        const home = parents.get(file.id)?.[0];
        if (home) homes.set(home, [...(homes.get(home) || []), file]);
      }
      for (const [home, files] of homes) await reverse('move', files, { id: home, name: '원래 폴더' });
    }
  } catch (error) {
    showToast(`되돌리지 못했습니다: ${humanizeDriveError(error)}`);
  }
}

function settleUndoJob(job, results) {
  const failed = results.filter((result) => result.status === 'rejected');
  if (!failed.length) return;
  showToast(`${failed.length.toLocaleString('ko-KR')}개를 되돌리지 못했습니다. 새로고침해 확인해 주세요.`);
}

// Failures always show. Success stays quiet over the player and for jobs finished while the app was closed.
function showDriveJobSuccess(job, message) {
  if (job.adopted || job.server || (el.playerSheet && !el.playerSheet.hidden)) return;
  showToast(message);
}

function settleTrashJob(job, results) {
  const succeeded = results.filter((result) => result.status === 'fulfilled').map((result) => result.item);
  const failed = results.filter((result) => result.status === 'rejected');
  const removedIds = new Set(succeeded.map((file) => file.id));
  if (removedIds.size) invalidateLibraryNavigationData();

  state.files = state.files.filter((file) => !removedIds.has(file.id));
  markFilesRemovedFromAccountState(removedIds);
  succeeded.forEach((file) => generatedThumbnailCache.delete(file.id));
  if (state.treeCache) {
    state.treeCache = buildTreeIndexes(state.treeCache.items.filter((file) => !removedIds.has(file.id)), state.treeCache.scannedFolderIds, state.treeCache.childListedIds);
  }

  if (!failed.length) {
    const suffix = state.demo ? ' (데모 시뮬레이션)' : ' Drive 휴지통에서 복구할 수 있습니다.';
    showDriveJobSuccess(job, `${succeeded.length.toLocaleString('ko-KR')}개 파일을 휴지통으로 이동했습니다.${suffix}`);
  } else {
    const firstError = failed[0]?.reason;
    failed.forEach(result => clearRejectedToken(result.reason));
    showToast(`${succeeded.length.toLocaleString('ko-KR')}개 휴지통 이동, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(firstError)}`);
  }
}

function performDeleteFile() {
  const files = actionFilesSnapshot().filter((file) => !state.hiddenActionFileIds.has(file.id));
  if (!files.length) return;
  return queueDriveActionJob({ action: 'trash', files, hide: true });
}

/* 삭제/이동으로 현재 파일이 목록에서 사라져도 플레이어를 유지하고
   다음 버튼과 같은 재생 순서(플레이어를 열 때의 목록 순서)에서 다음 파일로 넘어간다.
   랜덤 쇼츠 덱은 새로 섞지 않고 위·아래 기록을 그대로 둔다. 남은 파일이 없을 때만 플레이어를 닫는다. */
function playNextAfterRemoval(removedIds) {
  if (el.playerSheet.hidden || !state.selected) return;
  const list = getPlaybackFileList().filter((file) => !removedIds.has(file.id));
  const byId = new Map(list.map((file) => [file.id, file]));
  const order = state.playbackOrderIds;
  const start = order.indexOf(state.selected.id);
  let next = null;
  for (let step = 1; step <= order.length && !next; step++) {
    next = byId.get(order[(start + step) % order.length]) || null;
  }
  next ||= list[0] || null;
  if (!next) {
    closePlayer();
    return;
  }
  state.playbackDeck = retargetAccountPlaybackDeck(state.playbackDeck, next.id, list);
  state.playbackDeckComplete = hasCompletePlaybackPopulation();
  state.pendingPlay = true;
  animateMediaTransition('left', () => openMediaSource(next));
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

function performMoveFile() {
  if (quickMoveTargetPicking) return saveQuickMoveTargetPick();
  const files = actionFilesSnapshot().filter((file) => !state.hiddenActionFileIds.has(file.id));
  const targetRow = findMoveTargetRow(state.moveTargetFolderId);
  if (!files.length) {
    if (el.moveDialog?.open) el.moveDialog.close();
    return;
  }
  if (!targetRow?.id) {
    showToast('이동할 폴더를 다시 선택해 주세요.');
    return;
  }
  const blockReason = getBulkMoveBlockReason(files, targetRow);
  if (blockReason) {
    showToast(`이 폴더로 이동할 수 없습니다: ${blockReason}`);
    return;
  }
  // Closing cancels the folder index and clears the dialog's target, so both are captured first.
  if (el.moveDialog?.open) el.moveDialog.close();
  // Deep scan may still show a file moved inside the scanned subtree; elsewhere it leaves the view.
  return queueDriveActionJob({ action: 'move', files, targetRow, hide: !state.deepScan });
}

function settleMoveJob(job, results) {
  const { targetRow } = job;
  const moved = results.filter((result) => result.status === 'fulfilled' && !result.value?.skipped).map((result) => result.item);
  const skipped = results.filter((result) => result.status === 'fulfilled' && result.value?.skipped).map((result) => result.item);
  const failed = results.filter((result) => result.status === 'rejected');
  const movedIds = new Set(moved.map((file) => file.id));
  if (movedIds.size) invalidateLibraryNavigationData();
  if ((moved.length || skipped.length) && !job.adopted) rememberRecentMoveFolder(targetRow);

  if (!state.deepScan) state.files = state.files.filter((file) => !movedIds.has(file.id));
  if (state.treeCache) state.treeCache = buildTreeIndexes(state.treeCache.items, state.treeCache.scannedFolderIds, state.treeCache.childListedIds);

  const currentId = state.selected?.id || null;
  if (job.playerFollows && currentId && movedIds.has(currentId)) playNextAfterRemoval(movedIds);

  if (!failed.length) {
    const skippedText = skipped.length ? ` · ${skipped.length.toLocaleString('ko-KR')}개는 이미 해당 위치` : '';
    const demoText = state.demo ? ' (데모 시뮬레이션)' : '';
    showDriveJobSuccess(job, `${moved.length.toLocaleString('ko-KR')}개 파일을 이동했습니다${skippedText}.${demoText}`);
  } else {
    failed.forEach(result => clearRejectedToken(result.reason));
    const skippedText = skipped.length ? `, ${skipped.length.toLocaleString('ko-KR')}개 이미 해당 위치` : '';
    showToast(`${moved.length.toLocaleString('ko-KR')}개 이동${skippedText}, ${summarizeDriveMutationFailures(failed)}: ${humanizeDriveError(failed[0]?.reason)}`);
    if (!job.adopted && failed.some((result) => result.reason?.status === 403)) openPermissionGuide();
  }
}

/* 이름 바꾸기 — 파일명 창에서 고쳐 저장하면 창을 바로 닫고 뒤에서 처리한다.
   Drive가 독립 GET으로 새 이름을 확인한 뒤에만 목록·플레이어의 이름을 바꾼다. */
function normalizeRenameInput(value) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();
}

function findRenamePendingFor(fileId) {
  return driveActionJobs.find((job) => job.action === 'rename' && job.ids?.has(fileId)) || null;
}

async function renameDriveFile(file, name, options) {
  if (state.demo) {
    await new Promise((resolve) => setTimeout(resolve, 180));
    return { skipped: file.name === name };
  }
  const playbackOwner = state.selected?.id === file.id
    ? { fileId: file.id, session: state.mediaSession, accountGeneration: state.driveSessionGeneration,
      snapshot: capturePlaybackSnapshot() } : null;
  const owner = captureDriveMutationOwner();
  const result = await executeDriveMutation(file, 'rename', null, { ...options, name });
  owner.assert();
  file.version = result.metadata.version;
  file.capabilities = { ...(file.capabilities || {}), ...result.metadata.capabilities };
  return { ...result, playbackOwner };
}

function performRenameFile(file, rawName) {
  const name = normalizeRenameInput(rawName);
  if (!file?.id || !name || name === file.name) return null;
  if (findRenamePendingFor(file.id)) {
    showToast('이 파일의 이름을 바꾸는 중입니다. 끝난 뒤 다시 시도해 주세요.');
    return null;
  }
  return queueDriveActionJob({ action: 'rename', files: [file], name, hide: false });
}

function applyRenamedFile(fileId, name, metadata) {
  // A prepared source is metadata-bound too, even if it has not been opened.
  if (q0Prewarm?.fileId === fileId) {
    q0Prewarm.controller.abort();
    q0Prewarm = null;
  }
  const seen = new Set();
  const rename = (file) => {
    if (!file || file.id !== fileId || seen.has(file)) return;
    seen.add(file);
    file.name = name;
    if (metadata) {
      for (const key of ['version','mimeType','size','modifiedTime','headRevisionId','sha256Checksum','resourceKey']) {
        if (Object.prototype.hasOwnProperty.call(metadata, key)) file[key] = metadata[key];
      }
      file.capabilities = { ...(file.capabilities || {}), ...metadata.capabilities };
    }
  };
  state.files.forEach(rename);
  state.treeCache?.items?.forEach(rename);
  rename(state.selected);
  if (state.selected?.id === fileId && el.playerTitle) el.playerTitle.textContent = name;
  if (state.selected?.id === fileId && el.mobileShortsTitle) el.mobileShortsTitle.textContent = name;
  if (state.fileNameDialogFile?.id === fileId && el.fileNameText && el.fileNameDialog?.open
    && !el.fileNameDialog.classList.contains('editing')) el.fileNameText.textContent = name;
}

function settleRenameJob(job, results) {
  const [result] = results;
  const file = result?.item || job.files[0];
  if (result?.status === 'fulfilled') {
    file.name = job.name;
    applyRenamedFile(file.id, job.name, result.value?.metadata);
    if (!result.value?.skipped && result.value?.playbackOwner) {
      restartPlaybackAfterConfirmedRename(state.selected, result.value.playbackOwner);
    }
    invalidateLibraryNavigationData();
    const demoText = state.demo ? ' (데모 시뮬레이션)' : '';
    showToast(`이름을 '${job.name}'(으)로 바꿨습니다.${demoText}`);
    return;
  }
  const error = result?.reason;
  clearRejectedToken(error);
  const status = error?.mutationState;
  showToast(status === 'uncertain' ? '이름 변경 결과를 아직 확인하지 못했습니다. 새로고침하면 다시 확인합니다.'
    : status === 'conflict' ? '파일 상태가 바뀌어 이름을 바꾸지 못했습니다. 새로고침해 확인해 주세요.'
      : `이름을 바꾸지 못했습니다: ${humanizeDriveError(error)}`);
}

function openPermissionGuide() {
  if (el.permissionDialog && !el.permissionDialog.open) el.permissionDialog.showModal();
}

