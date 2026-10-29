'use strict';

// Startup, element binding, event wiring, service worker registration and app updates.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

window.addEventListener('DOMContentLoaded', init);

function consumeAuthCallbackError() {
  let url;
  try { url = new URL(location.href); }
  catch (_) { return null; }
  const values = url.searchParams.getAll('authError');
  if (!values.length) return null;
  url.searchParams.delete('authError');
  try {
    history.replaceState(history.state, document.title, `${url.pathname}${url.search}${url.hash}`);
  } catch (_) {}
  if (values.length !== 1) return null;
  const code = values[0];
  if (!Object.hasOwn(AUTH_CALLBACK_ERROR_MESSAGES, code)) return null;
  const message = AUTH_CALLBACK_ERROR_MESSAGES[code];
  return typeof message === 'string' ? message : null;
}

function showAuthCallbackError(message) {
  if (!message || hasUsableToken()) return false;
  setAuthError(message);
  return true;
}

async function init() {
  const authCallbackError = consumeAuthCallbackError();
  if (location.search && location.search.includes('_update=')) {
    try {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('_update');
      history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
    } catch (_) {}
  }

  bindElements();
  bindEvents();
  setupPlayerChrome();
  setupTouchGestures();
  setupMediaZoom();
  setupInputModality();
  document.querySelectorAll('select').forEach(enhanceSelect);
  setupLibraryEdgeBackGesture();
  cleanupStaleOriginalBuffers().catch(() => {});
  removeLegacyCredentialStorage();
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
  if (el.settingsAppVersion) el.settingsAppVersion.textContent = `v${APP_VERSION}`;

  setBootstrapAuthPending(true);
  // The same-origin credential request does not need the worker. On a first
  // visit, ready waits for the whole shell install, so overlap the two.
  const credential = state.demo || location.protocol === 'file:'
    ? null : requestSessionCredential({ background: true, force: true });
  credential?.catch(() => {});
  await setupServiceWorker();

  if (state.demo) {
    setBootstrapAuthPending(false);
    startDemoMode();
  } else if (await (credential || requestSessionCredential({ background: true, force: true }))) {
    setBootstrapAuthPending(false);
    showLibrary();
  } else {
    setBootstrapAuthPending(false);
    updateConnectionBadge();
    showSetup();
    showAuthCallbackError(authCallbackError);
  }
}

function bindElements() {
  const ids = [
    'brandButton', 'connectionBadge', 'settingsButton', 'settingsUpdateDot',
    'updateBanner', 'updateBannerText', 'bannerUpdateButton', 'closeBannerButton',
    'setupView', 'libraryView', 'authHint',
    'connectButton', 'openSetupHelp', 'librarySummary', 'refreshButton', 'searchInput',
    'sortSelect', 'libraryOptions', 'libraryStatus', 'accountSyncStatus', 'fileGrid', 'emptyState', 'emptyStateTitle', 'emptyStateText', 'loadMoreButton',
    'selectionModeButton', 'selectionToolbar', 'selectionCountText', 'selectionSelectAllBtn',
    'selectionMoveBtn', 'selectionDeleteBtn', 'selectionCancelBtn',
    'infiniteScrollSpinner',
    'folderNav', 'breadcrumbTrail', 'folderUpButton', 'libraryTitle', 'folderStrip', 'folderMoreButton', 'edgeBackIndicator',
    'playerSheet', 'playerBackdrop', 'playerModal', 'playerTitle', 'playerQuality', 'topbarPrevBtn', 'topbarRandomBtn', 'topbarNextBtn',
    'topbarFavoriteBtn', 'topbarDeleteBtn',
    'fullscreenButton', 'iconExpand', 'iconCompress', 'closePlayerButton',
    'mediaStage', 'ambientBackdrop', 'videoPlayer', 'imageViewer',
    'mediaSwipeNeighbor', 'mediaSwipeNeighborBackdrop', 'mediaSwipeNeighborImage', 'mediaSwipeNeighborTitle',
    'drivePreview', 'drivePreviewActions', 'drivePreviewRetryButton', 'drivePreviewOpenButton', 'playerControlsEntry', 'hidePlayerControlsButton', 'closeMediaErrorButton', 'playerFeedback', 'favoriteFeedback',
    'mobileShortsOverlay', 'mobileShortsTitle', 'mobileShortsProgressBar', 'mobileShortsProgressTrack', 'mobileTimeDisplay', 'mobileCurrentTime', 'mobileTotalTime',
    'stageCenterPlayBtn',
    'iconCenterPlay', 'iconCenterPause', 'customVideoControls', 'seekBarContainer',
    'seekBarBuffered', 'seekBarPlayed', 'seekBarThumb', 'seekBarTooltip',
    'ctrlPrevVideo', 'ctrlPlayPause', 'ctrlIconPlay', 'ctrlIconPause', 'ctrlNextVideo', 'ctrlRandomShorts',
    'ctrlRewind', 'ctrlFramePrev', 'ctrlFrameNext', 'ctrlForward', 'ctrlDelete', 'ctrlMove', 'ctrlRename',
    'shortsExpandRow', 'shortsDeleteBtn', 'shortsDriveBtn', 'shortsPipBtn', 'shortsMoveBtn', 'shortsRenameBtn', 'shortsFramePrev', 'shortsFrameNext',
    'shortsFullscreenBtn', 'shortsMoreBtn', 'shortsRotateBtn', 'shortsFavoriteBtn', 'deepScanToggle', 'deepScanStopBtn',
    'moveDialog', 'moveFileName', 'moveSearchInput', 'moveFolderList', 'moveCancelButton', 'moveConfirmButton',
    'volumeControlGroup', 'ctrlMute', 'ctrlIconVolHigh', 'ctrlIconVolMuted',
    'ctrlVolumeSlider', 'ctrlTimeDisplay', 'ctrlCurrentTime', 'ctrlTotalTime',
    'speedMenuWrap', 'ctrlSpeedButton', 'ctrlSpeedText', 'speedDropdown', 'playerMoreMenu',
    'ctrlTracks', 'shortsTracksBtn', 'playerTracksDialog', 'playerTracksClose',
    'playerAudioTrack', 'playerSubtitleTrack', 'playerTracksStatus', 'playerTracksRetry',
    'ctrlFavorite', 'ctrlPip', 'ctrlFullscreen', 'ctrlIconExpand', 'ctrlIconCompress',
    'mediaLoading', 'mediaLoadingProgress', 'mediaLoadingPercent', 'mediaError', 'mediaErrorTitle', 'mediaErrorMessage',
    'retryMediaButton', 'bufferOriginalButton', 'videoCompatButton', 'compatPlayerButton', 'openDriveButton', 'streamModeLabel', 'streamModeText',
    'qualityBadge', 'mediaResolution',
    'mediaFileSizeType', 'codecNote', 'settingsDialog', 'settingsAppVersion',
    'updateStatusText', 'checkUpdateButton', 'applyUpdateButton', 'forceReloadButton',
    'logoutButton', 'disconnectButton', 'setupHelpSection', 'settingsAdvanced',
    'fileNameDialog', 'fileNameDialogTitle', 'fileNameView', 'fileNameText', 'fileNameCopyButton', 'fileNameRenameButton',
    'fileNameEdit', 'fileNameInput', 'fileNameHint', 'fileNameEditCancelButton', 'fileNameSaveButton',
    'subfolderDialog', 'subfolderDialogText', 'subfolderAllCheckbox', 'subfolderTree', 'subfolderOffButton', 'subfolderApplyButton',
    'currentOrigin', 'copyOriginButton', 'appVersion', 'toast', 'driveActionStatus', 'driveActionStatusText',
    'deleteDialog', 'deleteFileName', 'deleteCancelButton', 'deleteConfirmButton',
    'permissionDialog', 'permissionReconnectButton', 'permissionCloseButton',
    'seekHintLeft', 'seekHintRight',
    'mediaZoomHud', 'mediaZoomResetBtn', 'mediaZoomLockBtn', 'ctrlZoomLock', 'shortsZoomLockBtn'
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
  el.filterButtons = [...document.querySelectorAll('[data-filter]')];
  el.speedButtons = [...document.querySelectorAll('#speedDropdown [data-speed]')];
}

// Focus rings are shown only while the keyboard drives focus (D117).
function setupInputModality() {
  const root = document.documentElement;
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') root.dataset.input = 'keyboard';
  }, true);
  document.addEventListener('pointerdown', () => { delete root.dataset.input; }, true);
}

function bindDialogLightDismiss(dialog) {
  if (!dialog) return;
  let startedOnBackdrop = false;
  dialog.addEventListener('pointerdown', (event) => {
    startedOnBackdrop = event.target === dialog;
  });
  dialog.addEventListener('click', (event) => {
    if (!startedOnBackdrop || event.target !== dialog) return;
    startedOnBackdrop = false;
    dialog.close();
  });
  dialog.addEventListener('pointercancel', () => { startedOnBackdrop = false; });
}

function setupLibraryOptions() {
  const options = el.libraryOptions;
  if (!options) return;
  document.addEventListener('click', event => {
    if (options.open && !options.contains(event.target)) options.open = false;
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !options.open) return;
    event.preventDefault();
    options.open = false;
    options.querySelector('summary')?.focus();
  });
}

function bindEvents() {
  setupLibraryOptions();
  document.getElementById?.('reconnectButton')?.addEventListener('click', beginAuthorization);
  el.connectButton.addEventListener('click', beginAuthorization);
  el.openSetupHelp.addEventListener('click', () => openSettings(true));
  el.settingsButton.addEventListener('click', () => openSettings(false));
  el.brandButton.addEventListener('click', () => {
    closePlayer();
    if (!state.token && !state.demo) return;
    showLibrary();
    navigateToLibraryHome();
  });
  el.refreshButton.addEventListener('click', () => {
    void recoverDriveMutations({ notifyResult: true }).catch(() => {});
    state.treeCache = null;
    state.folderIndex = null;
    state.moveFolderRows = [];
    if (state.filter === 'favorites') loadFavoriteFiles();
    else applyFolderView();
  });
  // IME composition fires input per jamo; coalesce the grid render, not the query.
  let searchRenderTimer = null;
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase('ko');
    state.folderRenderLimit = FOLDER_RENDER_MAX;
    clearTimeout(searchRenderTimer);
    searchRenderTimer = setTimeout(() => {
      searchRenderTimer = null;
      renderFiles({ resetWindow: true });
    }, SEARCH_RENDER_DELAY_MS);
  });
  el.sortSelect.addEventListener('change', async (event) => {
    state.sort = event.target.value;
    if (state.sort === 'random') {
      if (state.filter === 'favorites') {
        shuffleCurrentFiles();
        renderFiles({ resetWindow: true });
        return;
      }
      await shuffleWholeFolder(state.listGeneration);
    } else {
      renderFiles({ resetWindow: true });
    }
  });
  el.filterButtons.forEach((button) => button.addEventListener('click', () => {
    setLibraryFilter(button.dataset.filter);
  }));
  el.loadMoreButton.addEventListener('click', () => {
    if (state.listLoadError) void loadFiles({ append: Boolean(state.nextPageToken) });
  });
  if (el.selectionModeButton) el.selectionModeButton.addEventListener('click', () => enterSelectionMode());
  if (el.selectionCancelBtn) el.selectionCancelBtn.addEventListener('click', exitSelectionMode);
  if (el.selectionSelectAllBtn) el.selectionSelectAllBtn.addEventListener('click', selectAllVisibleFiles);
  if (el.selectionDeleteBtn) el.selectionDeleteBtn.addEventListener('click', requestDeleteFile);
  if (el.selectionMoveBtn) el.selectionMoveBtn.addEventListener('click', requestMoveFile);
  if (el.folderMoreButton) el.folderMoreButton.addEventListener('click', () => {
    state.folderRenderLimit += FOLDER_RENDER_MAX;
    renderFiles();
  });
  if (el.closePlayerButton) el.closePlayerButton.addEventListener('click', requestClosePlayer);
  if (el.playerBackdrop) el.playerBackdrop.addEventListener('click', requestClosePlayer);
  if (el.fullscreenButton) el.fullscreenButton.addEventListener('click', toggleFullscreen);
  if (el.pipButton) el.pipButton.addEventListener('click', togglePictureInPicture);

  // Topbar and control-bar navigation; control-bar presses also keep controls visible.
  for (const [btn, navigate, keepsControls] of [
    [el.topbarPrevBtn, () => playPrevFile('right'), false],
    [el.topbarRandomBtn, () => playRandomFile('up'), false],
    [el.topbarNextBtn, () => playNextFile('left'), false],
    [el.ctrlPrevVideo, () => playPrevFile('right'), true],
    [el.ctrlRandomShorts, () => playRandomFile('up'), true],
    [el.ctrlNextVideo, () => playNextFile('left'), true]
  ]) {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (keepsControls) resetControlsTimer();
      navigate();
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  // The tap recognizer owns pairs; fullscreen has its explicit control.
  // Cancel native double-click defaults without changing the media scale.
  el.mediaStage.addEventListener('dblclick', (event) => event.preventDefault());
  el.mediaStage.addEventListener('click', onMediaStageClick);
  document.addEventListener('keydown', handlePlayerKeyboard);
  document.addEventListener('keyup', handlePlayerKeyUp);
  window.addEventListener('blur', releaseHoldSpeedKey);

  // Custom Video Controls Event Listeners
  if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.addEventListener('click', togglePlayPause);
  if (el.ctrlPlayPause) el.ctrlPlayPause.addEventListener('click', togglePlayPause);
  if (el.ctrlRewind) el.ctrlRewind.addEventListener('click', () => seekRelative(-10));
  if (el.ctrlFramePrev) el.ctrlFramePrev.addEventListener('click', () => stepVideoFrame(-1));
  if (el.ctrlFrameNext) el.ctrlFrameNext.addEventListener('click', () => stepVideoFrame(1));
  if (el.shortsFramePrev) el.shortsFramePrev.addEventListener('click', () => stepVideoFrame(-1));
  if (el.shortsFrameNext) el.shortsFrameNext.addEventListener('click', () => stepVideoFrame(1));
  if (el.ctrlForward) el.ctrlForward.addEventListener('click', () => seekRelative(10));
  if (el.ctrlMute) el.ctrlMute.addEventListener('click', toggleMute);
  if (el.ctrlVolumeSlider) el.ctrlVolumeSlider.addEventListener('input', onVolumeSliderInput);
  if (el.ctrlSpeedButton) el.ctrlSpeedButton.addEventListener('click', toggleSpeedMenu);
  if (el.ctrlPip) el.ctrlPip.addEventListener('click', togglePictureInPicture);
  if (el.ctrlFullscreen) el.ctrlFullscreen.addEventListener('click', toggleFullscreen);
  [el.topbarFavoriteBtn, el.ctrlFavorite, el.shortsFavoriteBtn].forEach((button) => {
    if (!button) return;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleFavoriteForSelected({ showFeedback: true });
    });
  });
  if (el.playerMoreMenu) el.playerMoreMenu.addEventListener('toggle', () => {
    isPlayerMoreOpen = el.playerMoreMenu.open;
    resetControlsTimer();
  });
  [el.ctrlTracks, el.shortsTracksBtn].forEach(button => button?.addEventListener('click', event => {
    event.stopPropagation(); void openPlayerTracks();
  }));
  el.playerTracksClose?.addEventListener('click', () => el.playerTracksDialog.close());
  el.playerTracksDialog?.addEventListener('close', cancelPlayerTrackDiscovery);
  el.playerTracksRetry?.addEventListener('click', () => void retryPlayerTracks());
  el.playerAudioTrack?.addEventListener('change', () => void selectPlayerAudioTrack());
  el.playerSubtitleTrack?.addEventListener('change', () => {
    const owner = playerTracksOwner;
    if (!owner?.current() || !owner.presentation) return;
    try {
      owner.presentation.select(el.playerSubtitleTrack.value === '' ? null : Number(el.playerSubtitleTrack.value));
      el.playerTracksStatus.textContent = el.playerSubtitleTrack.value
        ? '텍스트 자막을 표시합니다. 원본 글꼴·꾸밈·배치는 적용하지 않습니다.' : '자막을 껐습니다.';
    } catch (_) { el.playerTracksStatus.textContent = '선택한 자막을 표시하지 못했습니다.'; }
  });
  if (el.speedButtons) {
    el.speedButtons.forEach((btn) => {
      btn.addEventListener('click', () => setPlaybackSpeed(Number(btn.dataset.speed)));
      btn.addEventListener('keydown', onSpeedMenuKeyDown);
    });
  }
  if (el.seekBarContainer) {
    el.seekBarContainer.addEventListener('pointerdown', onSeekPointerDown);
    el.seekBarContainer.addEventListener('pointermove', onSeekPointerHover);
    el.seekBarContainer.addEventListener('pointerleave', onSeekPointerLeave);
    el.seekBarContainer.addEventListener('keydown', onSeekKeyDown);
  }
  if (el.mobileShortsProgressTrack) {
    el.mobileShortsProgressTrack.addEventListener('pointerdown', onShortsProgressPointerDown);
    el.mobileShortsProgressTrack.addEventListener('keydown', onSeekKeyDown);
  }
  document.addEventListener('click', onDocumentClickForSpeedMenu);

  el.bannerUpdateButton.addEventListener('click', applyAppUpdate);
  el.closeBannerButton.addEventListener('click', () => { el.updateBanner.hidden = true; });
  el.checkUpdateButton.addEventListener('click', () => checkForAppUpdate({ manual: true }));
  el.applyUpdateButton.addEventListener('click', applyAppUpdate);
  el.forceReloadButton.addEventListener('click', forceReloadApp);

  el.retryMediaButton.addEventListener('click', retryMedia);
  el.bufferOriginalButton.addEventListener('click', confirmPendingMediaAction);
  el.videoCompatButton.addEventListener('click', () => {
    const choice=q3Choice; q3Choice=null; el.videoCompatButton.hidden=true;
    if(choice?.current()) void tryOriginalTsPlayback(choice.file,choice.session,
      {general:true,videoCompatibility:true,nativeVideoRejected:true,snapshotOverride:choice.snapshot});
  });
  el.compatPlayerButton.addEventListener('click', () => {
    if (state.selected) showDrivePreview(state.selected, '사용자 선택', { userInitiated: true });
  });
  el.closeMediaErrorButton.addEventListener('click', requestClosePlayer);
  el.openDriveButton.addEventListener('click', openSelectedInDrive);
  el.drivePreviewRetryButton.addEventListener('click', retryMedia);
  el.drivePreviewOpenButton.addEventListener('click', openSelectedInDrive);
  el.logoutButton.addEventListener('click', logout);
  el.disconnectButton.addEventListener('click', disconnect);
  el.copyOriginButton.addEventListener('click', copyOrigin);
  el.fileNameCopyButton?.addEventListener('click', copyFileNameText);
  el.fileNameRenameButton?.addEventListener('click', startFileNameEdit);
  el.fileNameEditCancelButton?.addEventListener('click', cancelFileNameEdit);
  el.fileNameSaveButton?.addEventListener('click', saveFileNameEdit);
  el.fileNameInput?.addEventListener('input', updateFileNameHint);
  el.fileNameInput?.addEventListener('keydown', (event) => {
    // Enter would submit the dialog form (its first button closes it); Korean IME
    // composition also ends with Enter, so only a settled Enter saves.
    if (event.key !== 'Enter' || event.isComposing || event.keyCode === 229) return;
    event.preventDefault();
    saveFileNameEdit();
  });
  el.fileNameDialog?.addEventListener('close', () => setFileNameEditing(false));

  // Folder navigation
  if (el.folderUpButton) el.folderUpButton.addEventListener('click', navigateToParentFolder);

  // Delete, move and rename flows (desktop controls, photo topbar, mobile shorts chips)
  for (const [buttons, request] of [
    [[el.ctrlDelete, el.topbarDeleteBtn, el.shortsDeleteBtn], () => requestDeleteFile()],
    [[el.ctrlMove, el.shortsMoveBtn], () => requestMoveFile()],
    [[el.ctrlRename, el.shortsRenameBtn], () => requestRenameFile()]
  ]) {
    for (const btn of buttons) {
      if (btn) btn.addEventListener('click', (e) => {
        e.stopPropagation();
        flashPressed(btn);
        if (el.playerMoreMenu) el.playerMoreMenu.open = false;
        request();
      });
    }
  }
  // Shorts chips sit above the stage; keep their taps out of stage gestures.
  for (const [btn, action] of [
    [el.shortsRotateBtn, () => toggleVideoRotation()], [el.shortsDriveBtn, () => openSelectedInDrive()],
    [el.shortsPipBtn, () => togglePictureInPicture()], [el.shortsFullscreenBtn, () => toggleFullscreen()],
    [el.shortsMoreBtn, () => toggleShortsExpand()]
  ]) {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      action();
    });
  }
  setupSubfolderPicker();
  if (el.deepScanStopBtn) el.deepScanStopBtn.addEventListener('click', () => {
    flashPressed(el.deepScanStopBtn);
    if (state.treeAbort) state.treeAbort.abort();
  });

  // Delete confirm dialog
  if (el.deleteCancelButton) el.deleteCancelButton.addEventListener('click', () => {
    flashPressed(el.deleteCancelButton);
    state.pendingActionFiles = [];
    el.deleteDialog.close();
  });
  if (el.deleteConfirmButton) el.deleteConfirmButton.addEventListener('click', performDeleteFile);
  if (el.deleteDialog) el.deleteDialog.addEventListener('cancel', () => { state.pendingActionFiles = []; });

  // Move dialog
  if (el.moveCancelButton) el.moveCancelButton.addEventListener('click', () => {
    flashPressed(el.moveCancelButton);
    cancelMoveFolderLoading();
    el.moveDialog.close();
  });
  if (el.moveConfirmButton) el.moveConfirmButton.addEventListener('click', performMoveFile);
  if (el.moveDialog) el.moveDialog.addEventListener('cancel', cancelMoveFolderLoading);
  if (el.moveDialog) el.moveDialog.addEventListener('close', cancelMoveFolderLoading);
  if (el.moveSearchInput) el.moveSearchInput.addEventListener('input', (event) => handleMoveSearchInput(event.target.value));

  // Permission guide dialog
  if (el.permissionCloseButton) el.permissionCloseButton.addEventListener('click', () => el.permissionDialog.close());
  if (el.permissionReconnectButton) el.permissionReconnectButton.addEventListener('click', () => {
    el.permissionDialog.close();
    state.retryAfterAuth = false;
    state.authRetryContext = null;
    beginAuthorization();
  });
  [el.settingsDialog, el.fileNameDialog, el.deleteDialog, el.moveDialog, el.permissionDialog, el.subfolderDialog].forEach((dialog) => bindDialogLightDismiss(dialog));
  window.addEventListener('online', () => {
    refreshForegroundCredential();
    updateConnectionBadge();
    updateAccountSyncStatus();
    if (state.accountId && state.accountStateSyncError) queueAccountStateSync();
    scheduleAccountStateRefresh(0);
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    resumeStandaloneAuthorization();
  });
  window.addEventListener('offline', () => {
    syncMediaSeekWatchdog();
    clearMediaFrameWatchdog('offline');
    stopAccountStateRefresh();
    updateConnectionBadge();
    updateAccountSyncStatus();
  });
  window.addEventListener('pagehide', stopAccountStateRefresh);
  // Leaving mid-job is safe (the mutation journal re-verifies on the next load), but the browser asks first.
  window.addEventListener('beforeunload', (event) => {
    if (!hasPendingDriveActions()) return;
    event.preventDefault();
    event.returnValue = '';
  });
  window.addEventListener('pageshow', () => {
    refreshForegroundCredential();
    resumeMediaViewObservation();
    scheduleAccountStateRefresh(0);
    markStandaloneAuthorizationReturned({ pageshow: true });
    resumeStandaloneAuthorization();
  });
  window.addEventListener('blur', markStandaloneAuthorizationHidden);
  window.addEventListener('focus', () => {
    refreshForegroundCredential();
    markStandaloneAuthorizationReturned();
    resumeStandaloneAuthorization();
  });
  window.addEventListener('storage', (event) => {
    if (!state.accountId || state.accountIdentityPending || event.key !== accountStateCacheKey()) return;
    let cached;
    try { cached = readCachedAccountMediaState(state.accountId); }
    catch (error) { state.accountStateSyncError = error; updateAccountSyncStatus(); return; }
    const merged = mergeAccountMediaStates(cached, state.accountMediaState);
    if (accountMediaStatesEqual(merged, state.accountMediaState)) return;
    applyMergedAccountMediaState(merged);
    state.favoriteFiles = state.favoriteFiles.filter((file) => merged.favorites[file.id]?.liked);
    refreshFavoritePresentation();
    if (state.filter === 'favorites') loadFavoriteFiles({ refreshState: false });
  });
  window.addEventListener('scroll', () => {
    const topbar = document.querySelector('.topbar');
    if (topbar) {
      topbar.classList.toggle('nav-scrolled', window.scrollY > 20);
    }
    scheduleRenderWindowUpdate();
  }, { passive: true });
  window.addEventListener('resize', scheduleRenderWindowUpdate, { passive: true });
  // Pointer/keyboard visibility is owned by setupPlayerChrome. Playback
  // events and general document activity never reveal controls.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      resumeMediaViewObservation();
      markStandaloneAuthorizationReturned();
      resumeStandaloneAuthorization();
      refreshForegroundCredential();
      // Quick app switches need not refetch version.json every time.
      if (Date.now() - lastAppUpdateCheckAt >= FOREGROUND_UPDATE_CHECK_MIN_INTERVAL_MS) checkForAppUpdate({ manual: false });
      scheduleAccountStateRefresh(0);
      syncMediaSeekWatchdog();
      syncMediaFrameWatchdog();
    } else {
      if (mediaViewObservation) mediaViewObservation.firstMediaTime = null;
      markStandaloneAuthorizationHidden();
      syncMediaSeekWatchdog();
      clearMediaFrameWatchdog('hidden');
      stopAccountStateRefresh();
    }
  });

  el.videoPlayer.addEventListener('loadedmetadata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    emitMediaDiagnosticStage('media-metadata', {
      currentTime: Number(event.currentTarget.currentTime) || 0,
      confidence: 'container-metadata'
    });
    updateVideoProgress();
    updatePlayPauseUI();
    beginVideoFrameSampling();
  });
  el.videoPlayer.addEventListener('canplay', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('canplay', { confidence: 'ready-state' });
      onMediaReady();
    }
  });
  el.videoPlayer.addEventListener('playing', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('playing', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
      onMediaReady();
      syncMediaFrameWatchdog();
    }
  });
  el.videoPlayer.addEventListener('timeupdate', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) { onVideoTimeUpdate(); refreshPlayerSubtitles(); }
  });
  el.videoPlayer.addEventListener('progress', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) onVideoProgressUpdate();
  });
  el.videoPlayer.addEventListener('waiting', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      if (el.mediaError?.hidden !== false && state.mediaAttempt !== 'blob-loading') {
        showMediaLoading();
        updateNativeLoadingProgress();
      }
      emitMediaDiagnosticStage('media-waiting', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
    }
  });
  el.videoPlayer.addEventListener('stalled', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      emitMediaDiagnosticStage('media-stalled', {
        currentTime: Number(event.currentTarget.currentTime) || 0
      });
    }
  });
  el.videoPlayer.addEventListener('seeking', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    observeNativeMediaSeeking(event.currentTarget);
    playerTracksOwner?.presentation?.clear();
  });
  el.videoPlayer.addEventListener('seeked', refreshPlayerSubtitles);
  el.videoPlayer.addEventListener('seeked', handleVideoSeeked);
  el.videoPlayer.addEventListener('play', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    updatePlayPauseUI();
    beginVideoFrameSampling();
    syncMediaSeekWatchdog();
    syncMediaFrameWatchdog();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('pause', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    stopMobileHoldSpeed();
    syncMediaSeekWatchdog();
    clearMediaFrameWatchdog('paused');
    updatePlayPauseUI();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('ended', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    stopMobileHoldSpeed();
    clearMediaSeekWatchdog('ended');
    clearMediaFrameWatchdog('ended');
  });
  el.videoPlayer.addEventListener('volumechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateVolumeUI();
  });
  el.videoPlayer.addEventListener('ratechange', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) {
      syncMediaSeekWatchdog();
      updateSpeedUI();
    }
  });
  el.videoPlayer.addEventListener('resize', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) updateQualityDisplay();
  });
  el.videoPlayer.addEventListener('error', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    clearMediaSeekWatchdog('media-error');
    clearMediaFrameWatchdog('media-error');
    handleMediaElementError('video');
  });
  el.videoPlayer.addEventListener('loadeddata', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    emitMediaDiagnosticStage('media-loaded-data', { confidence: 'decoded-current-frame' });
    scheduleVideoFramePresentation(event.currentTarget, state.mediaSession);
  });
  el.imageViewer.addEventListener('load', (event) => {
    if (!isCurrentMediaEvent(event.currentTarget)) return;
    if (!el.ambientBackdrop?.classList.contains('active') && el.imageViewer.src) {
      el.ambientBackdrop.style.backgroundImage = `url("${el.imageViewer.src}")`;
      el.ambientBackdrop.classList.add('active');
    }
    onMediaReady();
  });
  el.imageViewer.addEventListener('error', (event) => {
    if (isCurrentMediaEvent(event.currentTarget)) handleMediaElementError('image');
  });
  el.drivePreview.addEventListener('load', handleDrivePreviewLoad);
  el.drivePreview.addEventListener('error', handleDrivePreviewFailure);
}

async function setupServiceWorker() {
  if (location.protocol === 'file:') {
    if (!state.demo) {
      setAuthError('압축을 푼 파일을 직접 열면 스트리밍할 수 없습니다. HTTPS 주소에 배포한 뒤 사용하세요.');
    }
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    showToast('HTTPS 환경이 아니어서 원본 스트리밍 기능을 시작할 수 없습니다.');
    return;
  }
  // The first controller claim can precede registration.ready. Install the
  // private owner receiver before starting registration or native playback.
  navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
  try {
    const registration = await withDeadline(navigator.serviceWorker.register('./sw.js', { scope: './' }), 12_000);
    state.serviceWorkerRegistration = registration;
    await withDeadline(navigator.serviceWorker.ready, 12_000);

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updatePending) {
        window.location.reload();
      } else {
        sendTokenToWorker();
        restartPendingMediaAfterServiceWorkerChange();
      }
    });

    sendTokenToWorker();
    setInterval(sendTokenToWorker, 20_000);

    // Initial check after 2 seconds, then every 5 minutes
    setTimeout(() => checkForAppUpdate({ manual: false }), 2000);
    // A hidden page is checked again when it becomes visible.
    setInterval(() => {
      if (document.visibilityState !== 'hidden') checkForAppUpdate({ manual: false });
    }, 5 * 60 * 1000);
  } catch (error) {
    reportAppFailure('service-worker-registration', error, 'warn');
    if (!state.demo) showToast('원본 스트리밍 준비가 지연됩니다. 연결 상태를 확인한 뒤 새로고침하세요.');
  }
}

function restartPendingMediaAfterServiceWorkerChange() {
  const file = state.selected;
  const video = el.videoPlayer;
  const owner = q1Playback;
  if (owner && owner.swController !== navigator.serviceWorker?.controller
    && owner.fileId === file?.id && owner.session === state.mediaSession
    && owner.account === state.authAccountKey && owner.accountGeneration === state.driveSessionGeneration
    && el.playerSheet?.hidden === false) {
    const session = state.mediaSession, playbackSession = state.playbackSession,
      accountId = state.accountId, pin = q0PinnedSource,
      routeGeneration = ++initialMediaRouteGeneration;
    const snapshot = capturePlaybackSnapshot();
    if (snapshot) state.resumePosition = { fileId: file.id, time: snapshot.time, snapshot };
    state.pendingPlay = false;
    clearDirectMediaSources();
    const sourceGeneration = mediaSourceGeneration;
    state.mediaAttempt = 'worker-updating';
    setNativeVideoActionsAvailable(false);
    updatePlayPauseUI();
    showMediaLoading();
    void q1Retirement.then(() => {
      if (state.selected?.id !== file.id || state.mediaSession !== session
        || state.playbackSession !== playbackSession || state.accountId !== accountId
        || state.authAccountKey !== owner.account || state.driveSessionGeneration !== owner.accountGeneration
        || mediaSourceGeneration !== sourceGeneration || initialMediaRouteGeneration !== routeGeneration
        || q0PinnedSource !== pin || q0Playback || q1Playback || el.playerSheet?.hidden !== false
        || state.mediaAttempt !== 'worker-updating') return;
      // A replacement is not proof that the old worker's requests settled.
      // Keep the retirement result intact; only a fresh document may recover.
      state.mediaAttempt = 'worker-update-required';
      showMediaError('앱이 업데이트되어 원본 연결이 종료됐습니다. 앱을 다시 열어 재생하세요.',
        { title: '앱 다시 열기' });
    });
    return true;
  }
  if (
    !file?.mimeType?.startsWith('video/')
    || !['range', 'range-retry'].includes(state.mediaAttempt)
    || state.mediaTransportStarted === true
    || !video || video.hidden || !isCurrentMediaEvent(video)
  ) return false;

  return retryOriginalStream(
    file,
    state.mediaSession,
    '새 원본 스트림에 다시 연결하는 중',
    { consumeRetry: false }
  );
}

function withDeadline(operation, timeoutMs) {
  let timeout;
  return Promise.race([operation, new Promise((_, reject) => {
    timeout = setTimeout(() => reject(new Error('작업 응답 시간이 초과되었습니다.')), timeoutMs);
  })]).finally(() => clearTimeout(timeout));
}

function parseAppVersion(value) {
  const match = String(value || '').match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/);
  if (!match) return null;
  return {
    core: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : []
  };
}

function isNewerVersion(remote, local) {
  const parsedRemote = parseAppVersion(remote);
  const parsedLocal = parseAppVersion(local);
  if (!parsedRemote || !parsedLocal) return false;
  for (let i = 0; i < 3; i++) {
    if (parsedRemote.core[i] > parsedLocal.core[i]) return true;
    if (parsedRemote.core[i] < parsedLocal.core[i]) return false;
  }
  const remotePre = parsedRemote.prerelease;
  const localPre = parsedLocal.prerelease;
  if (!remotePre.length || !localPre.length) return localPre.length > remotePre.length;
  for (let i = 0; i < Math.max(remotePre.length, localPre.length); i++) {
    if (remotePre[i] === undefined) return false;
    if (localPre[i] === undefined) return true;
    if (remotePre[i] === localPre[i]) continue;
    const remoteNumeric = /^\d+$/.test(remotePre[i]);
    const localNumeric = /^\d+$/.test(localPre[i]);
    if (remoteNumeric && localNumeric) return Number(remotePre[i]) > Number(localPre[i]);
    if (remoteNumeric !== localNumeric) return !remoteNumeric;
    return remotePre[i] > localPre[i];
  }
  return false;
}

function notifyUpdateAvailable(newVersion, summary) {
  const verStr = newVersion ? `v${newVersion}` : '새 버전';
  if (el.updateBanner) {
    el.updateBanner.hidden = false;
    if (el.updateBannerText) {
      el.updateBannerText.textContent = summary
        ? `${verStr}: ${summary}`
        : `새로운 앱 버전(${verStr})이 준비되었습니다. 최신 기능을 적용하세요.`;
    }
  }
  if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = false;
  if (el.applyUpdateButton) {
    el.applyUpdateButton.hidden = false;
    el.applyUpdateButton.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>${verStr} 지금 업데이트 적용</span>`;
  }
  if (el.updateStatusText) {
    el.updateStatusText.textContent = `${verStr} 업데이트가 준비되었습니다. 지금 적용하세요.`;
  }
}

async function checkForAppUpdate({ manual = false } = {}) {
  lastAppUpdateCheckAt = Date.now();
  const generation = ++updateCheckGeneration;
  if (manual) updateCheckManualPending = true;
  const manualFeedback = updateCheckManualPending;
  const stillCurrent = () => generation === updateCheckGeneration;
  const controller = new AbortController();
  if (manual && el.updateStatusText) {
    el.updateStatusText.textContent = '최신 버전 확인 중…';
    if (el.checkUpdateButton) el.checkUpdateButton.disabled = true;
  }

  let remoteVersion = null;
  let releaseInfo = null;

  try {
    await withDeadline((async () => {
      // One deadline covers metadata/body and the non-cancellable worker check.
      const versionUrl = new URL(`version.json?_t=${Date.now()}`, location.href).href;
      const res = await fetch(versionUrl, {
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
      });
      if (res.ok) {
        releaseInfo = await res.json();
        remoteVersion = releaseInfo.version;
      }
      if (!res.ok || !parseAppVersion(remoteVersion)) {
        throw new Error('유효한 최신 버전 정보를 받지 못했습니다.');
      }
      if (stillCurrent() && !controller.signal.aborted
        && 'serviceWorker' in navigator && state.serviceWorkerRegistration) {
        await state.serviceWorkerRegistration.update().catch(() => {});
      }
    })(), UPDATE_CHECK_TIMEOUT_MS);
    if (!stillCurrent()) return { hasUpdate: false, superseded: true };

    const hasNewVersion = Boolean(remoteVersion && isNewerVersion(remoteVersion, APP_VERSION));

    if (hasNewVersion) {
      notifyUpdateAvailable(remoteVersion, releaseInfo?.changeSummary);
      if (manualFeedback) {
        showToast(`새로운 버전(v${remoteVersion})이 준비되었습니다. [지금 업데이트]를 눌러 적용하세요.`);
      }
      return { hasUpdate: true, version: remoteVersion };
    }

    // No new update -> strictly hide all update indicators
    if (el.updateBanner) el.updateBanner.hidden = true;
    if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = true;
    if (el.applyUpdateButton) el.applyUpdateButton.hidden = true;

    if (manualFeedback) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      if (el.updateStatusText) {
        el.updateStatusText.textContent = `현재 최신 버전(v${APP_VERSION})을 사용 중입니다. (${timeStr} 확인)`;
      }
      showToast(`현재 최신 버전(v${APP_VERSION})입니다.`);
    }
    return { hasUpdate: false, version: APP_VERSION };
  } catch (err) {
    if (!stillCurrent()) return { hasUpdate: false, superseded: true };
    reportAppFailure('update-check', err);
    if (manualFeedback) {
      if (el.updateStatusText) el.updateStatusText.textContent = '업데이트 확인 중 오류가 발생했습니다.';
      showToast('업데이트 확인 실패: 네트워크를 확인하세요.');
    }
    return { hasUpdate: false, error: err };
  } finally {
    controller.abort();
    if (stillCurrent()) {
      if (updateCheckManualPending && el.checkUpdateButton) el.checkUpdateButton.disabled = false;
      updateCheckManualPending = false;
    }
  }
}

async function applyAppUpdate() {
  updatePending = true;
  showToast('최신 버전을 즉시 적용합니다…');
  // Other tabs can keep an unregistered worker alive. Re-registering that
  // worker need not install/claim again, leaving this new document uncontrolled.
  // Preserve the registered worker and complete shell; its network-first path
  // refreshes known shell bytes during this document's reload.

  // Force a hard network reload bypassing browser HTTP disk cache
  const target = new URL(location.href);
  target.searchParams.set('_update', Date.now().toString());
  location.replace(target.href);
}

function forceReloadApp() {
  if (appShellRefreshPending) return appShellRefreshPending;
  const owner = { account: state.authAccountKey, accountId: state.accountId,
    generation: state.driveSessionGeneration, mediaSession: state.mediaSession,
    playbackSession: state.playbackSession, selected: state.selected, pin: q0PinnedSource,
    q0: q0Playback, q1: q1Playback, sourceGeneration: mediaSourceGeneration,
    seekGeneration: mediaSeekGeneration, routeGeneration: initialMediaRouteGeneration };
  const current = () => !updatePending && owner.account === state.authAccountKey
    && owner.accountId === state.accountId && owner.generation === state.driveSessionGeneration
    && owner.mediaSession === state.mediaSession && owner.playbackSession === state.playbackSession
    && owner.selected === state.selected && owner.pin === q0PinnedSource
    && owner.q0 === q0Playback && owner.q1 === q1Playback
    && owner.sourceGeneration === mediaSourceGeneration && owner.seekGeneration === mediaSeekGeneration
    && owner.routeGeneration === initialMediaRouteGeneration;
  showToast('앱 캐시를 최신 파일로 새로고침합니다…');
  let timer, channel;
  const operation = (async () => {
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('shell-refresh-timeout')), APP_SHELL_REFRESH_TIMEOUT_MS);
      });
      const sw = navigator.serviceWorker;
      if (!sw || typeof MessageChannel !== 'function') throw new Error('shell-refresh-unsupported');
      const scope = new URL('./', location.href).href;
      const controller = sw.controller;
      const registration = await Promise.race([sw.getRegistration(scope), deadline]);
      const worker = controller || registration?.active;
      const workerURL = worker?.scriptURL ? new URL(worker.scriptURL) : null;
      const expectedURL = new URL('sw.js', scope);
      const workerCurrent = () => current() && sw.controller === controller
        && registration?.scope === scope && registration.active === worker && worker?.state === 'activated';
      if (!workerCurrent() || workerURL?.origin !== expectedURL.origin
        || workerURL?.pathname !== expectedURL.pathname || workerURL.search || workerURL.hash)
        throw new Error('shell-refresh-owner');
      channel = new MessageChannel();
      const requestId = `shell-${++appShellRefreshSequence}`;
      const acknowledgement = new Promise((resolve, reject) => {
        channel.port1.onmessage = event => {
          const data = event.data;
          if (!data || data.type !== 'APP_SHELL_REFRESH_RESULT' || data.protocol !== APP_SHELL_REFRESH_PROTOCOL
            || data.requestId !== requestId || data.ok !== true || !parseAppVersion(data.version)
            || isNewerVersion(APP_VERSION, data.version)) return reject(new Error('shell-refresh-rejected'));
          resolve(data);
        };
        channel.port1.onmessageerror = () => reject(new Error('shell-refresh-message'));
        worker.postMessage({ type: 'APP_SHELL_REFRESH', protocol: APP_SHELL_REFRESH_PROTOCOL, requestId }, [channel.port2]);
      });
      await Promise.race([acknowledgement, deadline]);
      if (!workerCurrent()) return false;
      updatePending = true;
      window.location.reload();
      return true;
    } catch (error) {
      if (current()) {
        reportAppFailure('shell-refresh', error);
        showToast('앱 캐시 새로고침에 실패했습니다. 네트워크를 확인하고 다시 시도하세요.');
      }
      return false;
    } finally {
      clearTimeout(timer);
      if (channel) {
        channel.port1.onmessage = null;
        channel.port1.onmessageerror = null;
        channel.port1.close(); channel.port2.close();
      }
    }
  })();
  appShellRefreshPending = operation;
  void operation.finally(() => { if (appShellRefreshPending === operation) appShellRefreshPending = null; });
  return operation;
}

