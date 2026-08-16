'use strict';

const APP_VERSION = '1.11.0';
const CLIENT_ID_KEY = 'drive-original.oauth-client-id';
const TOKEN_STORAGE_KEY = 'drive-original.oauth-token';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_SKEW_MS = 30_000;
const MOBILE_BLOB_LIMIT = 350 * 1024 * 1024;
const DESKTOP_BLOB_LIMIT = 2 * 1024 * 1024 * 1024;
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const DRIVE_PAGE_SIZE = 1000;

const state = {
  clientId: localStorage.getItem(CLIENT_ID_KEY) || '',
  token: null,
  expiresAt: 0,
  tokenClient: null,
  folders: [],
  files: [],
  nextPageToken: null,
  currentFolderId: 'root',
  currentFolderName: '내 드라이브',
  folderStack: [],
  deepScan: false,
  treeCache: null,
  loadingTree: false,
  rootFolderId: null,
  videoRotated: false,
  treeAbort: null,
  folderIndex: null,
  loadingFolderIndex: false,
  moveTargetFolderId: null,
  moving: false,
  filter: 'all',
  query: '',
  sort: 'modifiedTime',
  selected: null,
  serviceWorkerRegistration: null,
  loadingFiles: false,
  retryAfterAuth: false,
  mediaAttempt: 'idle',
  mediaBlobUrl: null,
  mediaAbortController: null,
  mediaSession: 0,
  lastProxyError: null,
  playbackSession: 0,
  controlsTimeout: null,
  isSeeking: false,
  pendingPlay: false,
  deleting: false,
  demo: new URLSearchParams(location.search).get('demo') === '1'
};

const el = {};
let toastTimer = null;
let feedbackTimer = null;
let updatePending = false;
let controlsHideTimer = null;
let isSeekingPointer = false;
let isSpeedMenuOpen = false;
let tokenRenewalTimer = null;
let shuffledOrderMap = new Map();

window.addEventListener('DOMContentLoaded', init);

async function init() {
  if (location.search && location.search.includes('_update=')) {
    try {
      const cleanUrl = new URL(location.href);
      cleanUrl.searchParams.delete('_update');
      history.replaceState({}, document.title, cleanUrl.pathname + (cleanUrl.search ? cleanUrl.search : '') + cleanUrl.hash);
    } catch (_) {}
  }

  bindElements();
  bindEvents();
  setupTouchGestures();
  setupInfiniteScroll();
  setupMediaPrefetch();
  el.clientIdInput.value = state.clientId;
  el.settingsClientId.value = state.clientId;
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
  if (el.settingsAppVersion) el.settingsAppVersion.textContent = `v${APP_VERSION}`;
  
  await setupServiceWorker();

  // Automatic Login Flow:
  if (state.demo) {
    startDemoMode();
  } else if (loadSavedToken()) {
    // 1. Valid saved token exists in storage -> Instant zero-click auto login!
    sendTokenToWorker();
    updateConnectionBadge();
    showLibrary();
    loadFiles({ append: false });
  } else if (state.clientId && validateClientId(state.clientId)) {
    // 2. Client ID is saved -> Attempt silent background token request
    updateConnectionBadge();
    attemptSilentAutoLogin();
  } else {
    // 3. First time user -> Show setup view
    updateConnectionBadge();
    showSetup();
  }
}

function bindElements() {
  const ids = [
    'brandButton', 'connectionBadge', 'settingsButton', 'settingsUpdateDot',
    'updateBanner', 'updateBannerText', 'bannerUpdateButton', 'closeBannerButton',
    'setupView', 'libraryView', 'clientIdInput', 'clientIdHint', 'pasteClientId',
    'connectButton', 'openSetupHelp', 'librarySummary', 'refreshButton', 'searchInput',
    'sortSelect', 'libraryStatus', 'fileGrid', 'emptyState', 'loadMoreButton',
    'infiniteScrollSentinel', 'infiniteScrollSpinner',
    'folderNav', 'breadcrumbTrail', 'folderUpButton', 'libraryTitle', 'folderStrip',
    'playerSheet', 'playerBackdrop', 'playerModal', 'playerTitle', 'topbarPrevBtn', 'topbarRandomBtn', 'topbarNextBtn', 'topbarDeleteBtn',
    'pipButton', 'fullscreenButton', 'iconExpand', 'iconCompress', 'closePlayerButton', 'topbarMoveBtn',
    'mediaStage', 'ambientBackdrop', 'videoPlayer', 'imageViewer', 'drivePreview', 'playerFeedback',
    'mobileShortsOverlay', 'mobileShortsTitle', 'mobileShortsProgressBar', 'mobileShortsProgressTrack',
    'stageCenterPlayBtn',
    'iconCenterPlay', 'iconCenterPause', 'customVideoControls', 'seekBarContainer',
    'seekBarBuffered', 'seekBarPlayed', 'seekBarThumb', 'seekBarTooltip',
    'ctrlPrevVideo', 'ctrlPlayPause', 'ctrlIconPlay', 'ctrlIconPause', 'ctrlNextVideo', 'ctrlRandomShorts', 'ctrlRewind', 'ctrlForward', 'ctrlDelete', 'ctrlMove',
    'shortsExpandRow', 'shortsDeleteBtn', 'shortsDriveBtn', 'shortsPipBtn', 'shortsMoveBtn',
    'shortsFullscreenBtn', 'shortsMoreBtn', 'shortsRotateBtn', 'deepScanToggle', 'deepScanStopBtn',
    'moveDialog', 'moveFileName', 'moveSearchInput', 'moveFolderList', 'moveCancelButton', 'moveConfirmButton',
    'volumeControlGroup', 'ctrlMute', 'ctrlIconVolHigh', 'ctrlIconVolMuted',
    'ctrlVolumeSlider', 'ctrlTimeDisplay', 'ctrlCurrentTime', 'ctrlTotalTime',
    'speedMenuWrap', 'ctrlSpeedButton', 'ctrlSpeedText', 'speedDropdown',
    'ctrlPip', 'ctrlFullscreen', 'ctrlIconExpand', 'ctrlIconCompress',
    'mediaLoading', 'mediaLoadingText', 'mediaError', 'mediaErrorMessage',
    'retryMediaButton', 'openDriveButton', 'streamModeLabel', 'streamModeText',
    'qualityBadge', 'mediaResolution',
    'mediaFileSizeType', 'codecNote', 'settingsDialog', 'settingsAppVersion',
    'updateStatusText', 'checkUpdateButton', 'applyUpdateButton', 'forceReloadButton',
    'settingsClientId', 'saveSettingsButton', 'disconnectButton', 'setupHelpSection',
    'currentOrigin', 'copyOriginButton', 'appVersion', 'toast',
    'deleteDialog', 'deleteFileName', 'deleteCancelButton', 'deleteConfirmButton',
    'permissionDialog', 'permissionReconnectButton', 'permissionCloseButton',
    'seekHintLeft', 'seekHintRight'
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
  el.filterButtons = [...document.querySelectorAll('[data-filter]')];
  el.speedButtons = [...document.querySelectorAll('#speedDropdown [data-speed]')];
}

function bindEvents() {
  el.connectButton.addEventListener('click', beginAuthorization);
  el.clientIdInput.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') beginAuthorization();
  });
  el.clientIdInput.addEventListener('input', () => clearClientIdError());
  el.pasteClientId.addEventListener('click', pasteClientId);
  el.openSetupHelp.addEventListener('click', () => openSettings(true));
  el.settingsButton.addEventListener('click', () => openSettings(false));
  el.brandButton.addEventListener('click', () => {
    closePlayer();
    if (state.token || state.demo) showLibrary();
  });
  el.refreshButton.addEventListener('click', () => {
    if (state.sort === 'random') shuffleCurrentFiles();
    state.treeCache = null;
    applyFolderView();
  });
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase('ko');
    renderFiles();
  });
  el.sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    if (state.sort === 'random') {
      // 랜덤 배열은 '대상 폴더의 전체 파일'을 기준으로 한다 —
      // 아직 로드되지 않은 페이지가 있으면 모두 불러온 뒤 전체 세트로 셔플한다.
      shuffleCurrentFiles();
      renderFiles();
      if (state.nextPageToken && !state.demo && !state.deepScan) {
        ensureAllPagesLoaded().then(() => {
          shuffleCurrentFiles();
          renderFiles();
        });
      }
    } else {
      renderFiles();
    }
  });
  el.filterButtons.forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    el.filterButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderFiles();
  }));
  el.loadMoreButton.addEventListener('click', () => {
    if (state.nextPageToken) loadFiles({ append: true });
  });
  el.closePlayerButton.addEventListener('click', closePlayer);
  el.playerBackdrop.addEventListener('click', closePlayer);
  el.fullscreenButton.addEventListener('click', toggleFullscreen);
  el.pipButton.addEventListener('click', togglePictureInPicture);

  // Topbar and Controls Navigation Buttons (Robust Click Binding & Timer Resets)
  if (el.topbarPrevBtn) {
    el.topbarPrevBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playPrevFile('right');
    });
  }
  if (el.topbarRandomBtn) {
    el.topbarRandomBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playRandomFile('up');
    });
  }
  if (el.topbarNextBtn) {
    el.topbarNextBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      playNextFile('left');
    });
  }
  if (el.ctrlPrevVideo) {
    el.ctrlPrevVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playPrevFile('right');
    });
  }
  if (el.ctrlRandomShorts) {
    el.ctrlRandomShorts.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playRandomFile('up');
    });
  }
  if (el.ctrlNextVideo) {
    el.ctrlNextVideo.addEventListener('click', (e) => {
      e.stopPropagation();
      resetControlsTimer();
      playNextFile('left');
    });
  }

  document.addEventListener('fullscreenchange', updateFullscreenUI);
  document.addEventListener('webkitfullscreenchange', updateFullscreenUI);
  el.mediaStage.addEventListener('dblclick', (event) => {
    if (event.target.tagName !== 'BUTTON' && !event.target.closest('.custom-video-controls')) {
      toggleFullscreen();
    }
  });
  el.mediaStage.addEventListener('click', onMediaStageClick);
  el.mediaStage.addEventListener('pointermove', resetControlsTimer);
  el.mediaStage.addEventListener('pointerdown', resetControlsTimer);
  document.addEventListener('keydown', handlePlayerKeyboard);

  // Custom Video Controls Event Listeners
  if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.addEventListener('click', togglePlayPause);
  if (el.ctrlPlayPause) el.ctrlPlayPause.addEventListener('click', togglePlayPause);
  if (el.ctrlRewind) el.ctrlRewind.addEventListener('click', () => seekRelative(-10));
  if (el.ctrlForward) el.ctrlForward.addEventListener('click', () => seekRelative(10));
  if (el.ctrlMute) el.ctrlMute.addEventListener('click', toggleMute);
  if (el.ctrlVolumeSlider) el.ctrlVolumeSlider.addEventListener('input', onVolumeSliderInput);
  if (el.ctrlSpeedButton) el.ctrlSpeedButton.addEventListener('click', toggleSpeedMenu);
  if (el.ctrlPip) el.ctrlPip.addEventListener('click', togglePictureInPicture);
  if (el.ctrlFullscreen) el.ctrlFullscreen.addEventListener('click', toggleFullscreen);
  if (el.speedButtons) {
    el.speedButtons.forEach((btn) => btn.addEventListener('click', () => setPlaybackSpeed(Number(btn.dataset.speed))));
  }
  if (el.seekBarContainer) {
    el.seekBarContainer.addEventListener('pointerdown', onSeekPointerDown);
    el.seekBarContainer.addEventListener('pointermove', onSeekPointerHover);
    el.seekBarContainer.addEventListener('pointerleave', onSeekPointerLeave);
  }
  if (el.mobileShortsProgressTrack) {
    el.mobileShortsProgressTrack.addEventListener('pointerdown', onShortsProgressPointerDown);
  }
  document.addEventListener('click', onDocumentClickForSpeedMenu);

  el.bannerUpdateButton.addEventListener('click', applyAppUpdate);
  el.closeBannerButton.addEventListener('click', () => { el.updateBanner.hidden = true; });
  el.checkUpdateButton.addEventListener('click', () => checkForAppUpdate({ manual: true }));
  el.applyUpdateButton.addEventListener('click', applyAppUpdate);
  el.forceReloadButton.addEventListener('click', forceReloadApp);

  el.retryMediaButton.addEventListener('click', retryMedia);
  el.openDriveButton.addEventListener('click', openSelectedInDrive);
  el.saveSettingsButton.addEventListener('click', saveSettings);
  el.disconnectButton.addEventListener('click', disconnect);
  el.copyOriginButton.addEventListener('click', copyOrigin);

  // Folder navigation
  if (el.folderUpButton) el.folderUpButton.addEventListener('click', navigateToParentFolder);

  // Delete flow (desktop topbar, desktop controls, mobile shorts chips)
  [el.topbarDeleteBtn, el.ctrlDelete, el.shortsDeleteBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      flashPressed(btn);
      requestDeleteFile();
    });
  });
  // Move flow (desktop topbar, desktop controls, mobile shorts chips)
  [el.topbarMoveBtn, el.ctrlMove, el.shortsMoveBtn].forEach((btn) => {
    if (btn) btn.addEventListener('click', (e) => {
      e.stopPropagation();
      flashPressed(btn);
      requestMoveFile();
    });
  });
  if (el.shortsRotateBtn) el.shortsRotateBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleVideoRotation();
  });
  if (el.shortsDriveBtn) el.shortsDriveBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    openSelectedInDrive();
  });
  if (el.shortsPipBtn) el.shortsPipBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePictureInPicture();
  });
  if (el.shortsFullscreenBtn) el.shortsFullscreenBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleFullscreen();
  });
  if (el.shortsMoreBtn) el.shortsMoreBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleShortsExpand();
  });
  if (el.deepScanToggle) el.deepScanToggle.addEventListener('click', toggleDeepScan);
  if (el.deepScanStopBtn) el.deepScanStopBtn.addEventListener('click', () => {
    flashPressed(el.deepScanStopBtn);
    if (state.treeAbort) state.treeAbort.abort();
  });

  // Delete confirm dialog
  if (el.deleteCancelButton) el.deleteCancelButton.addEventListener('click', () => {
    flashPressed(el.deleteCancelButton);
    el.deleteDialog.close();
  });
  if (el.deleteConfirmButton) el.deleteConfirmButton.addEventListener('click', performDeleteFile);
  if (el.deleteDialog) el.deleteDialog.addEventListener('cancel', (e) => e.preventDefault());

  // Move dialog
  if (el.moveCancelButton) el.moveCancelButton.addEventListener('click', () => {
    flashPressed(el.moveCancelButton);
    el.moveDialog.close();
  });
  if (el.moveConfirmButton) el.moveConfirmButton.addEventListener('click', performMoveFile);
  if (el.moveDialog) el.moveDialog.addEventListener('cancel', (e) => e.preventDefault());
  if (el.moveSearchInput) el.moveSearchInput.addEventListener('input', (event) => {
    renderMoveFolderList(event.target.value);
  });

  // Permission guide dialog
  if (el.permissionCloseButton) el.permissionCloseButton.addEventListener('click', () => el.permissionDialog.close());
  if (el.permissionReconnectButton) el.permissionReconnectButton.addEventListener('click', () => {
    el.permissionDialog.close();
    state.retryAfterAuth = false;
    clearToken(false);
    state.tokenClient = null;
    requestAccessToken();
  });
  if (el.permissionDialog) el.permissionDialog.addEventListener('cancel', (e) => e.preventDefault());
  window.addEventListener('online', updateConnectionBadge);
  window.addEventListener('offline', updateConnectionBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      sendTokenToWorker();
      checkForAppUpdate({ manual: false });
    }
  });

  el.videoPlayer.addEventListener('loadedmetadata', () => {
    updateVideoProgress();
    updatePlayPauseUI();
    onMediaReady();
  });
  el.videoPlayer.addEventListener('canplay', onMediaReady, { once: false });
  el.videoPlayer.addEventListener('timeupdate', onVideoTimeUpdate);
  el.videoPlayer.addEventListener('progress', onVideoProgressUpdate);
  el.videoPlayer.addEventListener('play', () => {
    updatePlayPauseUI();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('pause', () => {
    updatePlayPauseUI();
    resetControlsTimer();
  });
  el.videoPlayer.addEventListener('volumechange', updateVolumeUI);
  el.videoPlayer.addEventListener('ratechange', updateSpeedUI);
  el.videoPlayer.addEventListener('resize', updateQualityDisplay);
  el.videoPlayer.addEventListener('error', () => handleMediaElementError('video'));
  el.videoPlayer.addEventListener('loadeddata', () => {
    el.videoPlayer.removeAttribute('poster');
    tryCaptureAmbientFrame();
  });
  el.imageViewer.addEventListener('load', () => {
    if (!el.ambientBackdrop?.classList.contains('active') && el.imageViewer.src) {
      el.ambientBackdrop.style.backgroundImage = `url("${el.imageViewer.src}")`;
      el.ambientBackdrop.classList.add('active');
    }
    onMediaReady();
  });
  el.drivePreview.addEventListener('load', () => {
    if (state.mediaAttempt === 'drive-preview') onMediaReady();
  });
}

async function setupServiceWorker() {
  if (location.protocol === 'file:') {
    if (!state.demo) {
      setClientIdError('압축을 푼 파일을 직접 열면 스트리밍할 수 없습니다. HTTPS 주소에 배포한 뒤 사용하세요.');
    }
    return;
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    showToast('HTTPS 환경이 아니어서 원본 스트리밍 기능을 시작할 수 없습니다.');
    return;
  }
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    state.serviceWorkerRegistration = registration;
    await navigator.serviceWorker.ready;

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (updatePending) {
        window.location.reload();
      } else {
        sendTokenToWorker();
      }
    });

    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    sendTokenToWorker();
    setInterval(sendTokenToWorker, 20_000);

    // Initial check after 2 seconds, then every 5 minutes
    setTimeout(() => checkForAppUpdate({ manual: false }), 2000);
    setInterval(() => checkForAppUpdate({ manual: false }), 5 * 60 * 1000);
  } catch (error) {
    console.error('Service worker registration failed', error);
  }
}

function isNewerVersion(remote, local) {
  if (!remote || !local) return false;
  if (remote === local) return false;
  const cleanR = remote.replace(/^[^\d]*/, '').split('.').map(Number);
  const cleanL = local.replace(/^[^\d]*/, '').split('.').map(Number);
  for (let i = 0; i < Math.max(cleanR.length, cleanL.length); i++) {
    const r = cleanR[i] || 0;
    const l = cleanL[i] || 0;
    if (r > l) return true;
    if (r < l) return false;
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
    el.applyUpdateButton.textContent = `${verStr} 지금 적용`;
  }
  if (el.updateStatusText) {
    el.updateStatusText.textContent = `${verStr} 업데이트가 준비되었습니다. 지금 적용하세요.`;
  }
}

async function checkForAppUpdate({ manual = false } = {}) {
  if (manual && el.updateStatusText) {
    el.updateStatusText.textContent = '최신 버전 확인 중…';
    if (el.checkUpdateButton) el.checkUpdateButton.disabled = true;
  }

  let remoteVersion = null;
  let releaseInfo = null;

  try {
    // Fetch remote version metadata directly from server (bypassing all caches)
    const versionUrl = new URL(`version.json?_t=${Date.now()}`, location.href).href;
    const res = await fetch(versionUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
    });

    if (res.ok) {
      releaseInfo = await res.json();
      remoteVersion = releaseInfo.version;
    }

    if ('serviceWorker' in navigator && state.serviceWorkerRegistration) {
      await state.serviceWorkerRegistration.update().catch(() => {});
    }

    const hasNewVersion = Boolean(remoteVersion && isNewerVersion(remoteVersion, APP_VERSION));

    if (hasNewVersion) {
      notifyUpdateAvailable(remoteVersion, releaseInfo?.changeSummary);
      if (manual) {
        showToast(`새로운 버전(v${remoteVersion})이 준비되었습니다. [지금 업데이트]를 눌러 적용하세요.`);
      }
      return { hasUpdate: true, version: remoteVersion };
    }

    // No new update -> strictly hide all update indicators
    if (el.updateBanner) el.updateBanner.hidden = true;
    if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = true;
    if (el.applyUpdateButton) el.applyUpdateButton.hidden = true;

    if (manual) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      if (el.updateStatusText) {
        el.updateStatusText.textContent = `현재 최신 버전(v${APP_VERSION})을 사용 중입니다. (${timeStr} 확인)`;
      }
      showToast(`현재 최신 버전(v${APP_VERSION})입니다.`);
    }
    return { hasUpdate: false, version: APP_VERSION };
  } catch (err) {
    console.error('Update check failed:', err);
    if (manual) {
      if (el.updateStatusText) el.updateStatusText.textContent = '업데이트 확인 중 오류가 발생했습니다.';
      showToast('업데이트 확인 실패: 네트워크를 확인하세요.');
    }
    return { hasUpdate: false, error: err };
  } finally {
    if (manual && el.checkUpdateButton) el.checkUpdateButton.disabled = false;
  }
}

async function applyAppUpdate() {
  updatePending = true;
  showToast('최신 버전을 즉시 적용합니다…');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (_) {}

  // Force a hard network reload bypassing browser HTTP disk cache
  const target = new URL(location.href);
  target.searchParams.set('_update', Date.now().toString());
  location.replace(target.href);
}

async function forceReloadApp() {
  showToast('캐시를 삭제하고 앱을 새로고침합니다…');
  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }
  } catch (e) {
    console.error('Force clear error', e);
  }
  window.location.reload(true);
}

function handleWorkerMessage(event) {
  const data = event.data || {};
  if (data.type === 'TOKEN_REQUEST' && event.ports && event.ports[0]) {
    const valid = hasUsableToken();
    event.ports[0].postMessage(valid ? { token: state.token, expiresAt: state.expiresAt } : null);
    return;
  }
  if (data.type === 'MEDIA_AUTH_REQUIRED') {
    state.lastProxyError = { status: 401 };
    clearToken(false);
    if (state.selected) showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    updateConnectionBadge();
    return;
  }
  if (data.type === 'MEDIA_PROXY_ERROR') {
    state.lastProxyError = data;
    if (data.status === 403 && state.selected) {
      showMediaError('Drive에서 원본 파일 전송을 거부했습니다. 파일의 다운로드 허용 설정과 계정 권한을 확인하세요.');
    }
  }
}

function sendTokenToWorker() {
  if (!hasUsableToken()) return;
  const message = { type: 'SET_TOKEN', token: state.token, expiresAt: state.expiresAt };
  if (navigator.serviceWorker.controller) navigator.serviceWorker.controller.postMessage(message);
  const registration = state.serviceWorkerRegistration;
  [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
}

function saveToken(token, expiresAt) {
  state.token = token;
  state.expiresAt = expiresAt;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, JSON.stringify({ token, expiresAt }));
  } catch (_) {}
  scheduleTokenRenewal();
}

function loadSavedToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (data?.token && typeof data.expiresAt === 'number') {
      if (Date.now() < data.expiresAt - TOKEN_SKEW_MS) {
        state.token = data.token;
        state.expiresAt = data.expiresAt;
        scheduleTokenRenewal();
        return true;
      }
    }
  } catch (_) {}
  return false;
}

function scheduleTokenRenewal() {
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  if (!state.token || !state.expiresAt) return;
  // Proactively renew 5 minutes before token expiration
  const remainingMs = state.expiresAt - Date.now() - (5 * 60 * 1000);
  const delayMs = Math.max(10_000, remainingMs);
  tokenRenewalTimer = setTimeout(() => {
    if (state.clientId && validateClientId(state.clientId)) {
      attemptSilentAutoLogin({ background: true });
    }
  }, delayMs);
}

function beginAuthorization() {
  const clientId = el.clientIdInput.value.trim();
  if (!validateClientId(clientId)) {
    setClientIdError('웹 OAuth 클라이언트 ID 전체를 입력하세요. 끝이 apps.googleusercontent.com이어야 합니다.');
    return;
  }
  state.clientId = clientId;
  localStorage.setItem(CLIENT_ID_KEY, clientId);
  el.settingsClientId.value = clientId;
  requestAccessToken();
}

async function requestAccessToken() {
  setConnectBusy(true);
  updateConnectionBadge('busy');
  try {
    await waitForGoogleIdentity();
    if (!state.tokenClient) {
      state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: DRIVE_SCOPE,
        callback: handleTokenResponse,
        error_callback: (error) => {
          console.error('Google OAuth popup error', error);
          setConnectBusy(false);
          updateConnectionBadge();
          showToast('Google 로그인 창을 완료하지 못했습니다. Safari 팝업 차단 설정을 확인하세요.');
        }
      });
    }
    state.tokenClient.requestAccessToken({ prompt: '' });
  } catch (error) {
    console.error(error);
    setConnectBusy(false);
    updateConnectionBadge();
    setClientIdError('Google 인증 라이브러리를 불러오지 못했습니다. 네트워크 연결을 확인하세요.');
  }
}

async function attemptSilentAutoLogin({ background = false } = {}) {
  if (!state.clientId || !validateClientId(state.clientId)) {
    if (!background) showSetup();
    return;
  }
  if (!background) {
    setConnectBusy(true);
    updateConnectionBadge('busy');
  }
  try {
    await waitForGoogleIdentity();
    if (!state.tokenClient) {
      state.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: state.clientId,
        scope: DRIVE_SCOPE,
        callback: handleTokenResponse,
        error_callback: (err) => {
          console.log('Silent auto-login request requires user prompt or was dismissed:', err);
          if (!background) {
            setConnectBusy(false);
            updateConnectionBadge();
            showSetup();
          }
        }
      });
    }
    state.tokenClient.requestAccessToken({ prompt: '' });
  } catch (err) {
    console.error('Silent auto-login error:', err);
    if (!background) {
      setConnectBusy(false);
      updateConnectionBadge();
      showSetup();
    }
  }
}

async function handleTokenResponse(response) {
  setConnectBusy(false);
  if (!response || response.error || !response.access_token) {
    updateConnectionBadge();
    if (response?.error !== 'user_cancelled') {
      setClientIdError(response?.error_description || 'Google 인증이 완료되지 않았습니다.');
    }
    return;
  }
  const expiresIn = Math.max(60, Number(response.expires_in) || 3600);
  saveToken(response.access_token, Date.now() + expiresIn * 1000);
  clearClientIdError();
  sendTokenToWorker();
  updateConnectionBadge();

  if (state.retryAfterAuth && state.selected) {
    state.retryAfterAuth = false;
    openMediaSource(state.selected);
    return;
  }
  if (!state.files.length) {
    await loadFiles({ append: false });
  }
}

function waitForGoogleIdentity(timeoutMs = 12_000) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (window.google?.accounts?.oauth2) return resolve();
      if (Date.now() - started > timeoutMs) return reject(new Error('Google Identity Services timeout'));
      setTimeout(tick, 100);
    };
    tick();
  });
}

let infiniteScrollObserver = null;
const generatedThumbnailCache = new Map();

function setupInfiniteScroll() {
  if (infiniteScrollObserver) {
    infiniteScrollObserver.disconnect();
  }
  if (!el.infiniteScrollSentinel) return;

  infiniteScrollObserver = new IntersectionObserver((entries) => {
    const entry = entries[0];
    if (entry && entry.isIntersecting) {
      if (state.nextPageToken && !state.loadingFiles) {
        loadFiles({ append: true });
      }
    }
  }, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0
  });

  infiniteScrollObserver.observe(el.infiniteScrollSentinel);
}

/* 로딩 단축 — 뷰포트에 가까워진 영상 카드의 첫 세그먼트(512KB)를 선제 프리페치한다.
   SW 프록시의 max-age 응답이 브라우저 HTTP 캐시에 남아 재생 시작이 즉시 이어지고,
   최소한 TCP/TLS+Drive 인증 경로가 예열된다. 데이터 절약 모드에서는 동작하지 않는다. */
let mediaPrefetchObserver = null;
const mediaPrefetchQueue = [];
let activeMediaPrefetches = 0;
const MAX_MEDIA_PREFETCHES = 2;
const MEDIA_PREFETCH_BYTES = 512 * 1024;

function setupMediaPrefetch() {
  if (state.demo || location.protocol === 'file:') return;
  if (!('IntersectionObserver' in window) || !window.isSecureContext) return;
  if (navigator.connection?.saveData) return;
  mediaPrefetchObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      mediaPrefetchObserver.unobserve(entry.target);
      queueMediaPrefetch(entry.target.__file);
    });
  }, {
    root: null,
    rootMargin: '150% 0px',
    threshold: 0
  });
}

function queueMediaPrefetch(file) {
  if (!file || file.__prefetched) return;
  if (!file.mimeType?.startsWith('video/')) return;
  if (file.capabilities?.canDownload === false) return;
  if (!hasUsableToken()) return;
  file.__prefetched = true;
  mediaPrefetchQueue.push(file);
  pumpMediaPrefetch();
}

function pumpMediaPrefetch() {
  while (activeMediaPrefetches < MAX_MEDIA_PREFETCHES && mediaPrefetchQueue.length) {
    const file = mediaPrefetchQueue.shift();
    activeMediaPrefetches++;
    fetch(buildMediaUrl(file), {
      headers: { Range: `bytes=0-${MEDIA_PREFETCH_BYTES - 1}` }
    }).catch(() => {
      file.__prefetched = false; // 실패 시 재시도 여지를 남긴다
    }).finally(() => {
      activeMediaPrefetches--;
      pumpMediaPrefetch();
    });
  }
}

const thumbnailExtractionQueue = [];
let activeThumbnailExtractions = 0;
const MAX_CONCURRENT_EXTRACTIONS = 2;
const THUMBNAIL_CACHE_LIMIT = 240;

function cacheGeneratedThumbnail(fileId, dataUrl) {
  generatedThumbnailCache.delete(fileId);
  generatedThumbnailCache.set(fileId, dataUrl);
  if (generatedThumbnailCache.size > THUMBNAIL_CACHE_LIMIT) {
    const oldest = generatedThumbnailCache.keys().next().value;
    generatedThumbnailCache.delete(oldest);
  }
}

function extractVideoFrameThumbnail(file, imgElement, visualContainer) {
  if (!file || !file.mimeType?.startsWith('video/')) return;
  const cached = generatedThumbnailCache.get(file.id);
  if (cached) {
    imgElement.src = cached;
    imgElement.classList.add('loaded');
    visualContainer.classList.add('has-thumbnail');
    return;
  }

  thumbnailExtractionQueue.push({ file, imgElement, visualContainer });
  processThumbnailQueue();
}

function processThumbnailQueue() {
  if (activeThumbnailExtractions >= MAX_CONCURRENT_EXTRACTIONS || thumbnailExtractionQueue.length === 0) {
    return;
  }

  const { file, imgElement, visualContainer } = thumbnailExtractionQueue.shift();

  const cached = generatedThumbnailCache.get(file.id);
  if (cached) {
    imgElement.src = cached;
    imgElement.classList.add('loaded');
    visualContainer.classList.add('has-thumbnail');
    processThumbnailQueue();
    return;
  }

  // The card may have been re-rendered away while waiting in the queue; skip the fetch.
  if (!imgElement.isConnected) {
    setTimeout(processThumbnailQueue, 0);
    return;
  }

  activeThumbnailExtractions++;
  visualContainer.classList.add('is-generating');

  const mediaUrl = buildMediaUrl(file);
  const video = document.createElement('video');
  video.preload = 'metadata';
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = 'anonymous';
  video.src = mediaUrl;
  video.currentTime = 0.1;

  let isDone = false;
  const finish = (dataUrl = null) => {
    if (isDone) return;
    isDone = true;
    activeThumbnailExtractions--;
    visualContainer.classList.remove('is-generating');
    try {
      video.removeAttribute('src');
      video.load();
    } catch (_) {}
    if (dataUrl) {
      cacheGeneratedThumbnail(file.id, dataUrl);
      imgElement.src = dataUrl;
      imgElement.classList.add('loaded');
      visualContainer.classList.add('has-thumbnail');
    }
    setTimeout(processThumbnailQueue, 40);
  };

  // Capture only after the 0.1s seek has landed; a loadeddata frame at position 0 is often black.
  const capture = () => {
    if (video.currentTime < 0.05) return;
    try {
      const w = video.videoWidth || 320;
      const h = video.videoHeight || 180;
      if (w > 0 && h > 0) {
        const canvas = document.createElement('canvas');
        const scale = Math.min(1, 360 / Math.max(w, h));
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
        finish(dataUrl);
        return;
      }
    } catch (err) {
      console.warn('Canvas frame capture warning:', err);
    }
    finish();
  };

  video.addEventListener('loadeddata', capture);
  video.addEventListener('seeked', capture);
  video.addEventListener('error', () => finish(), { once: true });
  setTimeout(() => finish(), 4000);
}

async function loadFiles({ append }) {
  if (state.demo) {
    startDemoMode();
    return;
  }
  if (state.loadingFiles) return;
  if (!hasUsableToken()) {
    showSetup();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return;
  }

  state.loadingFiles = true;
  showLibrary();
  if (!append) el.libraryStatus.textContent = 'Drive에서 폴더와 원본 파일 목록을 불러오는 중…';
  el.refreshButton.disabled = true;
  if (el.infiniteScrollSpinner) el.infiniteScrollSpinner.hidden = false;

  const parentClause = state.currentFolderId === 'root'
    ? `'root' in parents`
    : `'${state.currentFolderId}' in parents`;
  const params = new URLSearchParams({
    pageSize: String(DRIVE_PAGE_SIZE),
    orderBy: 'folder,modifiedTime desc',
    q: `trashed = false and ${parentClause} and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/' or mimeType contains 'image/')`,
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,capabilities(canDownload,canDelete),videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
  });
  if (append && state.nextPageToken) params.set('pageToken', state.nextPageToken);

  try {
    const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`);
    const data = await response.json();
    const incoming = Array.isArray(data.files) ? data.files : [];
    const incomingFolders = incoming.filter((f) => f.mimeType === FOLDER_MIME);
    const incomingMedia = incoming.filter((f) => f.mimeType?.startsWith('video/') || f.mimeType?.startsWith('image/'));

    if (append) {
      state.files = dedupeFiles([...state.files, ...incomingMedia]);
      state.folders = dedupeFiles([...state.folders, ...incomingFolders]);
    } else {
      state.files = incomingMedia;
      state.folders = incomingFolders;
    }
    state.nextPageToken = data.nextPageToken || null;
    renderFiles();
    el.libraryStatus.textContent = '';

    // Proactive background prefetch for butter-smooth infinite scroll
    if (!append && state.nextPageToken) {
      setTimeout(() => {
        if (state.nextPageToken && !state.loadingFiles) {
          loadFiles({ append: true });
        }
      }, 1000);
    }
  } catch (error) {
    console.error(error);
    el.libraryStatus.textContent = `파일 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    if (error.status === 401) {
      clearToken(false);
      if (state.clientId && validateClientId(state.clientId)) {
        attemptSilentAutoLogin({ background: true });
      } else {
        showSetup();
      }
    }
  } finally {
    state.loadingFiles = false;
    el.refreshButton.disabled = false;
    if (el.infiniteScrollSpinner) el.infiniteScrollSpinner.hidden = !state.nextPageToken;
    updateLibrarySummary();
    updateConnectionBadge();
  }
}

function navigateToFolder(folderId, folderName) {
  if (!folderId) return;
  if (folderId === state.currentFolderId) return;
  // The breadcrumb always renders root as the first crumb; keep it out of the stack.
  if (state.currentFolderId !== 'root') {
    state.folderStack.push({ id: state.currentFolderId, name: state.currentFolderName });
  }
  state.currentFolderId = folderId;
  state.currentFolderName = folderName || '폴더';
  state.files = [];
  state.folders = [];
  state.nextPageToken = null;
  shuffledOrderMap.clear();
  scrollToLibraryTop();
  animateFolderTransition('forward');
  applyFolderView();
}

function navigateToFolderIndex(index) {
  const crumbs = [{ id: 'root', name: '내 드라이브' }, ...state.folderStack, { id: state.currentFolderId, name: state.currentFolderName }];
  const target = crumbs[index];
  if (!target || target.id === state.currentFolderId) return;
  state.folderStack = crumbs.slice(1, index);
  state.currentFolderId = target.id;
  state.currentFolderName = target.name;
  state.files = [];
  state.folders = [];
  state.nextPageToken = null;
  shuffledOrderMap.clear();
  scrollToLibraryTop();
  animateFolderTransition('back');
  applyFolderView();
}

function navigateToParentFolder() {
  if (!state.folderStack.length) return;
  const parent = state.folderStack.pop();
  state.currentFolderId = parent.id;
  state.currentFolderName = parent.name;
  state.files = [];
  state.folders = [];
  state.nextPageToken = null;
  shuffledOrderMap.clear();
  scrollToLibraryTop();
  animateFolderTransition('back');
  applyFolderView();
}

/* Deep Scan — 현재 폴더 + 모든 하위 폴더의 미디어를 한 번에 로딩 */
function applyFolderView() {
  if (state.demo) {
    startDemoMode();
    return;
  }
  if (state.deepScan) {
    ensureTreeCache().then(() => {
      if (state.deepScan) computeAndRenderSubtree();
    });
    return;
  }
  loadFiles({ append: false });
}

async function ensureTreeCache() {
  if (state.treeCache || state.loadingTree) return;
  if (!hasUsableToken()) {
    showSetup();
    showToast('Google Drive 연결을 갱신해 주세요.');
    return;
  }
  state.loadingTree = true;
  const controller = new AbortController();
  state.treeAbort = controller;
  if (el.deepScanToggle) el.deepScanToggle.disabled = true;
  if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = false;
  el.libraryStatus.textContent = '드라이브 전체 폴더 트리를 수집하는 중…';
  try {
    if (!state.rootFolderId) {
      try {
        const about = await driveFetch(`${DRIVE_API}/about?fields=rootFolderId`);
        const info = await about.json();
        state.rootFolderId = info.rootFolderId || 'root';
      } catch (_) {
        state.rootFolderId = 'root';
      }
    }
    const items = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({
        pageSize: String(DRIVE_PAGE_SIZE),
        orderBy: 'folder,modifiedTime desc',
        q: `trashed = false and (mimeType = '${FOLDER_MIME}' or mimeType contains 'video/' or mimeType contains 'image/')`,
        spaces: 'drive',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,capabilities(canDownload,canDelete),parents,videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`, { signal: controller.signal });
      const data = await response.json();
      items.push(...(Array.isArray(data.files) ? data.files : []));
      pageToken = data.nextPageToken || null;
      el.libraryStatus.textContent = `드라이브 전체 폴더 트리 수집 중… ${items.length.toLocaleString('ko-KR')}개 항목`;
    } while (pageToken);
    state.treeCache = buildTreeIndexes(items);
    el.libraryStatus.textContent = '';
  } catch (error) {
    if (controller.signal.aborted || error?.name === 'AbortError') {
      // 사용자가 중지 버튼으로 취소 — 부분 데이터는 폐기하고 일반 모드로 복귀한다.
      el.libraryStatus.textContent = '폴더 트리 수집을 중단했습니다.';
      state.deepScan = false;
      syncDeepScanToggle();
      applyFolderView();
      return;
    }
    console.error(error);
    el.libraryStatus.textContent = `하위 폴더 전체를 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    if (error.status === 401) {
      clearToken(false);
      if (state.clientId && validateClientId(state.clientId)) attemptSilentAutoLogin({ background: true });
      else showSetup();
    }
    state.deepScan = false;
    syncDeepScanToggle();
  } finally {
    state.loadingTree = false;
    state.treeAbort = null;
    if (el.deepScanToggle) el.deepScanToggle.disabled = false;
    if (el.deepScanStopBtn) el.deepScanStopBtn.hidden = true;
  }
}

function buildTreeIndexes(items) {
  const foldersById = new Map();
  const foldersByParent = new Map();
  const mediaByParent = new Map();
  items.forEach((item) => {
    const parent = item.parents?.[0] || 'root';
    if (item.mimeType === FOLDER_MIME) {
      foldersById.set(item.id, item);
      if (!foldersByParent.has(parent)) foldersByParent.set(parent, []);
      foldersByParent.get(parent).push(item);
    } else {
      if (!mediaByParent.has(parent)) mediaByParent.set(parent, []);
      mediaByParent.get(parent).push(item);
    }
  });
  return { items, foldersById, foldersByParent, mediaByParent };
}

function effectiveRootId() {
  if (state.currentFolderId !== 'root') return state.currentFolderId;
  return state.rootFolderId || 'root';
}

function computeAndRenderSubtree() {
  const cache = state.treeCache;
  if (!cache) return;
  // 'root' 별칭과 실제 루트 폴더 ID 양쪽에서 직계 자식이 붙어 있을 수 있어 둘 다 탐색
  const rootIds = new Set([effectiveRootId()]);
  if (state.currentFolderId === 'root') rootIds.add('root');
  const queue = [...rootIds];
  const visited = new Set();
  const media = [];
  while (queue.length) {
    const folderId = queue.shift();
    if (visited.has(folderId)) continue;
    visited.add(folderId);
    (cache.mediaByParent.get(folderId) || []).forEach((file) => media.push(file));
    if (state.deepScan) {
      (cache.foldersByParent.get(folderId) || []).forEach((folder) => queue.push(folder.id));
    }
  }
  media.forEach((file) => {
    const parent = file.parents?.[0] || 'root';
    const origin = cache.foldersById.get(parent);
    file.__origin = rootIds.has(parent) ? '' : (origin?.name || '');
  });
  const current = cache.foldersById.get(state.currentFolderId);
  if (current?.name) state.currentFolderName = current.name;
  state.folders = dedupeFiles([...rootIds].flatMap((id) => cache.foldersByParent.get(id) || []));
  state.files = dedupeFiles(media);
  state.nextPageToken = null;
  shuffledOrderMap.clear();
  renderFiles();
  el.libraryStatus.textContent = '';
  updateLibrarySummary();
}

function toggleDeepScan() {
  if (state.loadingTree) return;
  state.deepScan = !state.deepScan;
  syncDeepScanToggle();
  shuffledOrderMap.clear();
  scrollToLibraryTop();
  animateFolderTransition(state.deepScan ? 'forward' : 'back');
  if (state.deepScan) {
    showToast('현재 폴더와 모든 하위 폴더의 미디어를 함께 불러옵니다.');
  }
  applyFolderView();
}

function syncDeepScanToggle() {
  if (!el.deepScanToggle) return;
  el.deepScanToggle.setAttribute('aria-pressed', String(state.deepScan));
  el.deepScanToggle.classList.toggle('active', state.deepScan);
}

function scrollToLibraryTop() {
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function animateFolderTransition(direction) {
  const targets = [el.fileGrid, el.folderStrip].filter(Boolean);
  if (!targets.length) return;
  targets.forEach((node) => {
    node.classList.remove('folder-enter-forward', 'folder-enter-back');
    void node.offsetWidth;
    node.classList.add(direction === 'forward' ? 'folder-enter-forward' : 'folder-enter-back');
  });
}

function renderBreadcrumb() {
  if (!el.breadcrumbTrail || !el.libraryTitle) return;
  el.libraryTitle.textContent = state.currentFolderName;
  const crumbs = [{ id: 'root', name: '내 드라이브' }, ...state.folderStack, { id: state.currentFolderId, name: state.currentFolderName }];
  el.breadcrumbTrail.replaceChildren();
  crumbs.forEach((crumb, index) => {
    const isLast = index === crumbs.length - 1;
    const chip = document.createElement(isLast ? 'span' : 'button');
    chip.className = `crumb ${isLast ? 'current' : ''}`.trim();
    chip.textContent = crumb.name;
    if (!isLast) {
      chip.type = 'button';
      chip.setAttribute('aria-label', `${crumb.name}(으)로 이동`);
      chip.addEventListener('click', () => navigateToFolderIndex(index));
    }
    el.breadcrumbTrail.appendChild(chip);
    if (!isLast) {
      const sep = document.createElement('span');
      sep.className = 'crumb-sep';
      sep.setAttribute('aria-hidden', 'true');
      sep.textContent = '/';
      el.breadcrumbTrail.appendChild(sep);
    }
  });
  if (el.folderUpButton) el.folderUpButton.hidden = state.folderStack.length === 0;
}

async function driveFetch(url, options = {}) {
  if (!hasUsableToken()) {
    const error = new Error('Google 인증이 만료되었습니다.');
    error.status = 401;
    throw error;
  }
  const response = await fetch(url, {
    ...options,
    cache: 'no-store',
    headers: { ...(options.headers || {}), Authorization: `Bearer ${state.token}` }
  });
  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message || '';
    } catch (_) {
      detail = response.statusText;
    }
    const error = new Error(detail || `Drive API ${response.status}`);
    error.status = response.status;
    throw error;
  }
  return response;
}

function renderFiles() {
  const files = filteredAndSortedFiles();
  const visibleFolders = state.filter === 'all'
    ? state.folders.filter((f) => !state.query || String(f.name || '').toLocaleLowerCase('ko').includes(state.query))
    : [];
  // Folders live in a compact navigation strip, clearly separated from media thumbnails.
  if (el.folderStrip) {
    el.folderStrip.replaceChildren();
    if (visibleFolders.length) {
      const folderFragment = document.createDocumentFragment();
      visibleFolders.forEach((folder, index) => folderFragment.appendChild(createFolderRow(folder, index)));
      el.folderStrip.appendChild(folderFragment);
      el.folderStrip.hidden = false;
    } else {
      el.folderStrip.hidden = true;
    }
  }
  el.fileGrid.replaceChildren();
  const fragment = document.createDocumentFragment();
  files.forEach((file, index) => fragment.appendChild(createFileCard(file, index)));
  el.fileGrid.appendChild(fragment);
  el.emptyState.hidden = files.length + visibleFolders.length > 0;
  renderBreadcrumb();
  updateLibrarySummary(files.length, visibleFolders.length);
}

function createFolderRow(folder, index = 0) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'folder-row';
  button.style.setProperty('--stagger', `${Math.min(index, 12) * 25}ms`);
  button.setAttribute('aria-label', `폴더 ${folder.name} 열기`);

  const glyph = document.createElement('span');
  glyph.className = 'folder-glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>';

  const name = document.createElement('span');
  name.className = 'folder-name';
  name.textContent = folder.name || '이름 없는 폴더';

  const meta = document.createElement('span');
  meta.className = 'folder-meta';
  meta.textContent = '폴더';

  const chevron = document.createElement('span');
  chevron.className = 'folder-chevron';
  chevron.setAttribute('aria-hidden', 'true');
  chevron.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>';

  button.append(glyph, name, meta, chevron);
  button.addEventListener('click', () => navigateToFolder(folder.id, folder.name));
  return button;
}

function shuffleCurrentFiles() {
  shuffledOrderMap.clear();
  const shuffled = [...state.files];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  shuffled.forEach((file, index) => {
    shuffledOrderMap.set(file.id, index);
  });
}

/* 무한 스크롤로 아직 불러오지 않은 페이지가 있을 때 전부 로드한다.
   랜덤 배열·랜덤 쇼츠가 '대상 폴더(또는 딥스캔 서브트리)의 전체 파일'을
   대상으로 동작하도록 보장한다. 진행 중 로드가 있으면 끝날 때까지 대기 후 이어 받는다. */
async function ensureAllPagesLoaded() {
  if (state.demo || state.deepScan) return;
  let guard = 0;
  while (state.nextPageToken && guard < 100) {
    guard++;
    if (state.loadingFiles) {
      await new Promise((resolve) => setTimeout(resolve, 120));
      continue;
    }
    await loadFiles({ append: true });
  }
}

function filteredAndSortedFiles() {
  const filtered = state.files.filter((file) => {
    const isVideo = file.mimeType?.startsWith('video/');
    const typeMatch = state.filter === 'all' || (state.filter === 'video' && isVideo) || (state.filter === 'image' && !isVideo);
    const queryMatch = !state.query || String(file.name || '').toLocaleLowerCase('ko').includes(state.query);
    return typeMatch && queryMatch;
  });

  if (state.sort === 'random') {
    if (shuffledOrderMap.size !== state.files.length) {
      shuffleCurrentFiles();
    }
    return filtered.sort((a, b) => {
      const idxA = shuffledOrderMap.get(a.id) ?? 0;
      const idxB = shuffledOrderMap.get(b.id) ?? 0;
      return idxA - idxB;
    });
  }

  return filtered.sort((a, b) => {
    if (state.sort === 'name') return String(a.name).localeCompare(String(b.name), 'ko', { numeric: true });
    if (state.sort === 'size') return Number(b.size || 0) - Number(a.size || 0);
    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
  });
}

function createFileCard(file, index = 0) {
  const isVideo = file.mimeType?.startsWith('video/');
  const canDownload = file.capabilities?.canDownload !== false;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-card';
  button.disabled = !canDownload;
  button.setAttribute('aria-label', `${file.name}, ${isVideo ? '영상' : '이미지'}, 원본 열기`);

  const visual = document.createElement('div');
  visual.className = `file-card-visual ${isVideo ? 'video' : 'image'}`;
  
  const thumbnail = document.createElement('img');
  thumbnail.className = 'file-card-thumb';
  thumbnail.alt = '';
  thumbnail.loading = index < 24 ? 'eager' : 'lazy';
  if (index < 12) thumbnail.fetchPriority = 'high';
  thumbnail.decoding = 'async';
  thumbnail.referrerPolicy = 'no-referrer';
  thumbnail.addEventListener('load', () => {
    thumbnail.classList.add('loaded');
    visual.classList.add('has-thumbnail');
  });

  if (file.thumbnailLink) {
    thumbnail.addEventListener('error', () => {
      if (isVideo) {
        extractVideoFrameThumbnail(file, thumbnail, visual);
      } else {
        thumbnail.remove();
      }
    }, { once: true });
    thumbnail.src = file.thumbnailLink;
    visual.appendChild(thumbnail);
  } else if (isVideo) {
    visual.appendChild(thumbnail);
    extractVideoFrameThumbnail(file, thumbnail, visual);
  }

  // Format Badge (e.g., 4K, FHD, MP4, PNG)
  const res = resolutionText(file);
  let badgeLabel = isVideo ? 'VIDEO' : 'IMAGE';
  if (res) badgeLabel = res;
  else if (file.mimeType) badgeLabel = friendlyMime(file.mimeType);

  const badge = document.createElement('span');
  badge.className = 'file-card-badge';
  badge.textContent = badgeLabel;
  visual.appendChild(badge);

  // Play overlay on hover for video
  if (isVideo) {
    const overlay = document.createElement('div');
    overlay.className = 'file-card-play-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    const glyph = document.createElement('div');
    glyph.className = 'play-glyph-circle';
    glyph.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="6 3 20 12 6 21 6 3"/></svg>';
    overlay.appendChild(glyph);
    visual.appendChild(overlay);
  }

  const body = document.createElement('div');
  body.className = 'file-card-body';
  const name = document.createElement('span');
  name.className = 'file-card-title';
  name.textContent = file.name || '이름 없는 파일';
  
  const meta = document.createElement('div');
  meta.className = 'file-card-meta';
  if (file.__origin) {
    const origin = document.createElement('span');
    origin.className = 'file-card-origin';
    origin.textContent = file.__origin;
    meta.appendChild(origin);
  }
  const details = document.createElement('span');
  details.textContent = formatBytes(file.size);
  const status = document.createElement('span');
  status.className = 'file-card-status';
  status.textContent = canDownload ? '100% 원본' : '다운로드 제한';
  meta.append(details, status);

  body.append(name, meta);
  button.append(visual, body);
  if (canDownload) {
    button.addEventListener('click', () => openPlayer(file));
    if (mediaPrefetchObserver) {
      button.__file = file;
      mediaPrefetchObserver.observe(button);
    }
  }
  return button;
}

function updateLibrarySummary(visibleCount, visibleFolderCount) {
  const mediaCount = Number.isFinite(visibleCount) ? visibleCount : state.files.length;
  const folderCount = Number.isFinite(visibleFolderCount) ? visibleFolderCount : state.folders.length;
  const parts = [];
  if (folderCount > 0) parts.push(`폴더 ${folderCount.toLocaleString('ko-KR')}개`);
  parts.push(`미디어 ${mediaCount.toLocaleString('ko-KR')}개 표시`);
  if (state.nextPageToken) parts.push('더 불러오는 중…');
  if (state.deepScan && state.treeCache) parts.push('하위 폴더 전체 포함');
  el.librarySummary.textContent = parts.join(' · ');
}

function openPlayer(file) {
  state.selected = file;
  document.body.style.overflow = 'hidden';
  el.playerSheet.hidden = false;
  setStageImmersive(false);
  el.playerTitle.textContent = file.name || '이름 없는 파일';
  el.codecNote.textContent = 'Google Drive 원본 파일의 바이트를 1:1 무변환 실시간 스트리밍 중입니다. (손실 없음)';
  const isVideo = file.mimeType?.startsWith('video/');
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !isVideo;
  updateFullscreenUI();
  updateQualityDisplay();
  updatePlayPauseUI();
  updateVolumeUI();
  updateSpeedUI();
  resetControlsTimer();
  state.pendingPlay = true;
  openMediaSource(file);
  requestAnimationFrame(() => el.closePlayerButton.focus());
}

function formatPlayerTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const hrs = Math.floor(total / 3600);
  const mins = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const secsStr = secs < 10 ? `0${secs}` : `${secs}`;
  if (hrs > 0) {
    const minsStr = mins < 10 ? `0${mins}` : `${mins}`;
    return `${hrs}:${minsStr}:${secsStr}`;
  }
  return `${mins}:${secsStr}`;
}

function resetControlsTimer() {
  if (!el.mediaStage) return;
  el.mediaStage.classList.remove('controls-hidden');
  clearTimeout(controlsHideTimer);
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  if (isVideo && !el.videoPlayer.paused && !isSeekingPointer && !isSpeedMenuOpen) {
    controlsHideTimer = setTimeout(() => {
      if (!el.videoPlayer.paused && !isSeekingPointer && !isSpeedMenuOpen) {
        el.mediaStage.classList.add('controls-hidden');
      }
    }, 2800);
  }
}

function togglePlayPause(event) {
  if (event) event.stopPropagation();
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  if (el.videoPlayer.paused) {
    el.videoPlayer.play().catch(() => {});
  } else {
    el.videoPlayer.pause();
  }
  updatePlayPauseUI();
}

function updatePlayPauseUI() {
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  if (!isVideo) {
    if (el.customVideoControls) el.customVideoControls.hidden = true;
    if (el.stageCenterPlayBtn) el.stageCenterPlayBtn.hidden = true;
    return;
  }
  if (el.customVideoControls) el.customVideoControls.hidden = false;
  const isPaused = el.videoPlayer.paused;
  if (el.ctrlIconPlay && el.ctrlIconPause) {
    el.ctrlIconPlay.hidden = !isPaused;
    el.ctrlIconPause.hidden = isPaused;
  }
  if (el.iconCenterPlay && el.iconCenterPause) {
    el.iconCenterPlay.hidden = !isPaused;
    el.iconCenterPause.hidden = isPaused;
  }
  if (el.stageCenterPlayBtn) {
    el.stageCenterPlayBtn.hidden = !isPaused;
  }
}

function seekRelative(deltaSeconds) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const duration = el.videoPlayer.duration || Infinity;
  const target = Math.max(0, Math.min(duration, el.videoPlayer.currentTime + deltaSeconds));
  el.videoPlayer.currentTime = target;
  showPlayerFeedback(deltaSeconds > 0 ? `+${deltaSeconds}S` : `${deltaSeconds}S`);
  updateVideoProgress();
  resetControlsTimer();
}

function toggleMute() {
  if (!el.videoPlayer) return;
  el.videoPlayer.muted = !el.videoPlayer.muted;
  showPlayerFeedback(el.videoPlayer.muted ? 'MUTE ON' : `VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
  updateVolumeUI();
}

function onVolumeSliderInput(event) {
  if (!el.videoPlayer) return;
  const val = Number(event.target.value);
  el.videoPlayer.volume = val;
  el.videoPlayer.muted = (val === 0);
  updateVolumeUI();
}

function updateVolumeUI() {
  if (!el.videoPlayer) return;
  const isMuted = el.videoPlayer.muted || el.videoPlayer.volume === 0;
  if (el.ctrlIconVolHigh && el.ctrlIconVolMuted) {
    el.ctrlIconVolHigh.hidden = isMuted;
    el.ctrlIconVolMuted.hidden = !isMuted;
  }
  if (el.ctrlVolumeSlider) {
    el.ctrlVolumeSlider.value = isMuted ? 0 : el.videoPlayer.volume;
  }
}

function toggleSpeedMenu(event) {
  if (event) event.stopPropagation();
  isSpeedMenuOpen = !isSpeedMenuOpen;
  if (el.speedDropdown) el.speedDropdown.hidden = !isSpeedMenuOpen;
  resetControlsTimer();
}

function setPlaybackSpeed(speed) {
  if (!el.videoPlayer) return;
  el.videoPlayer.playbackRate = speed;
  if (el.ctrlSpeedText) el.ctrlSpeedText.textContent = `${speed}×`;
  const buttons = el.speedDropdown?.querySelectorAll('button') || [];
  buttons.forEach((btn) => {
    btn.classList.toggle('active', Number(btn.dataset.speed) === speed);
  });
  isSpeedMenuOpen = false;
  if (el.speedDropdown) el.speedDropdown.hidden = true;
  showPlayerFeedback(`SPEED ${speed}X`);
  resetControlsTimer();
}

function updateSpeedUI() {
  if (!el.videoPlayer) return;
  const speed = el.videoPlayer.playbackRate || 1;
  if (el.ctrlSpeedText) el.ctrlSpeedText.textContent = `${speed}×`;
}

function onDocumentClickForSpeedMenu(event) {
  if (isSpeedMenuOpen && !el.speedMenuWrap?.contains(event.target)) {
    isSpeedMenuOpen = false;
    if (el.speedDropdown) el.speedDropdown.hidden = true;
  }
}

function onVideoTimeUpdate() {
  if (isSeekingPointer) return;
  updateVideoProgress();
}

function onVideoProgressUpdate() {
  if (!el.videoPlayer || !el.seekBarBuffered) return;
  const duration = el.videoPlayer.duration;
  if (!duration || duration <= 0) return;
  const buffered = el.videoPlayer.buffered;
  if (buffered.length > 0) {
    const end = buffered.end(buffered.length - 1);
    const bufPercent = Math.min(100, (end / duration) * 100);
    el.seekBarBuffered.style.width = `${bufPercent}%`;
  }
}

function updateVideoProgress() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const currentTime = el.videoPlayer.currentTime || 0;
  const duration = el.videoPlayer.duration || 0;
  const percent = duration > 0 ? (currentTime / duration) * 100 : 0;

  if (el.seekBarPlayed) el.seekBarPlayed.style.width = `${percent}%`;
  if (el.seekBarThumb) el.seekBarThumb.style.left = `${percent}%`;
  if (el.mobileShortsProgressBar) el.mobileShortsProgressBar.style.width = `${percent}%`;
  if (el.ctrlCurrentTime) el.ctrlCurrentTime.textContent = formatPlayerTime(currentTime);
  if (el.ctrlTotalTime) el.ctrlTotalTime.textContent = formatPlayerTime(duration);
  if (el.seekBarContainer) {
    el.seekBarContainer.setAttribute('aria-valuenow', Math.round(currentTime));
    el.seekBarContainer.setAttribute('aria-valuemax', Math.round(duration));
  }
  onVideoProgressUpdate();
}

function getSeekRatio(event) {
  const rect = el.seekBarContainer.getBoundingClientRect();
  const clientX = event.clientX ?? (event.touches && event.touches[0]?.clientX) ?? 0;
  const clampedX = Math.max(0, Math.min(rect.width, clientX - rect.left));
  return rect.width > 0 ? clampedX / rect.width : 0;
}

function onSeekPointerDown(event) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  event.preventDefault();
  isSeekingPointer = true;
  el.seekBarContainer.classList.add('seeking');
  const ratio = getSeekRatio(event);
  const duration = el.videoPlayer.duration || 0;
  el.videoPlayer.currentTime = ratio * duration;
  updateVideoProgress();

  function onPointerMove(e) {
    if (!isSeekingPointer) return;
    const r = getSeekRatio(e);
    el.videoPlayer.currentTime = r * duration;
    updateVideoProgress();
    onSeekPointerHover(e);
  }

  function onPointerUp() {
    isSeekingPointer = false;
    el.seekBarContainer?.classList.remove('seeking');
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    resetControlsTimer();
  }

  document.addEventListener('pointermove', onPointerMove);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onSeekPointerHover(event) {
  if (!el.videoPlayer || !el.seekBarTooltip || el.videoPlayer.hidden) return;
  const ratio = getSeekRatio(event);
  const duration = el.videoPlayer.duration || 0;
  const hoverTime = ratio * duration;
  el.seekBarTooltip.textContent = formatPlayerTime(hoverTime);
  el.seekBarTooltip.style.left = `${ratio * 100}%`;
  el.seekBarTooltip.hidden = false;
}

function onSeekPointerLeave() {
  if (isSeekingPointer) return;
  if (el.seekBarTooltip) el.seekBarTooltip.hidden = true;
}

function onShortsProgressPointerDown(event) {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  const track = el.mobileShortsProgressTrack;
  const duration = el.videoPlayer.duration || 0;
  if (!duration) return;
  event.preventDefault();
  isSeekingPointer = true;

  const seekToPointer = (e) => {
    const rect = track.getBoundingClientRect();
    const clientX = e.clientX ?? (e.touches && e.touches[0]?.clientX) ?? 0;
    const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0;
    el.videoPlayer.currentTime = ratio * duration;
    updateVideoProgress();
  };

  const onPointerUp = () => {
    isSeekingPointer = false;
    document.removeEventListener('pointermove', seekToPointer);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    resetControlsTimer();
  };

  seekToPointer(event);
  document.addEventListener('pointermove', seekToPointer);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
}

function onMediaStageClick(event) {
  const target = event.target;
  if (
    target.closest('.custom-video-controls') ||
    target.closest('.stage-center-btn') ||
    target.closest('.media-error') ||
    target.closest('.media-loading') ||
    target.tagName === 'BUTTON' ||
    target.tagName === 'A'
  ) {
    return;
  }
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  if (isVideo) {
    togglePlayPause();
  }
}

function toggleFullscreen() {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (isFs) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  } else {
    const target = el.mediaStage || el.videoPlayer;
    if (target.requestFullscreen) {
      target.requestFullscreen().catch((err) => {
        console.warn('requestFullscreen error', err);
        if (el.videoPlayer.webkitEnterFullscreen) el.videoPlayer.webkitEnterFullscreen();
      });
    } else if (target.webkitRequestFullscreen) {
      target.webkitRequestFullscreen();
    } else if (el.videoPlayer.webkitEnterFullscreen) {
      el.videoPlayer.webkitEnterFullscreen();
    }
  }
}

function updateFullscreenUI() {
  const isFs = Boolean(document.fullscreenElement || document.webkitFullscreenElement);
  if (el.iconExpand && el.iconCompress) {
    el.iconExpand.hidden = isFs;
    el.iconCompress.hidden = !isFs;
  }
  if (el.ctrlIconExpand && el.ctrlIconCompress) {
    el.ctrlIconExpand.hidden = isFs;
    el.ctrlIconCompress.hidden = !isFs;
  }
  if (el.fullscreenButton) {
    el.fullscreenButton.title = isFs ? '전체화면 종료 (ESC / F)' : '전체화면 (F)';
    el.fullscreenButton.setAttribute('aria-label', isFs ? '전체화면 종료' : '전체화면');
  }
  if (el.ctrlFullscreen) {
    el.ctrlFullscreen.title = isFs ? '전체화면 종료 (ESC / F)' : '전체화면 (F)';
    el.ctrlFullscreen.setAttribute('aria-label', isFs ? '전체화면 종료' : '전체화면');
  }
}

async function togglePictureInPicture() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
    } else if (document.pictureInPictureEnabled) {
      await el.videoPlayer.requestPictureInPicture();
    }
  } catch (err) {
    console.warn('PiP error', err);
  }
}

/* Mobile shorts bottom action chips — ⋯ 버튼으로 삭제/이동/PiP/Drive 노출 */
let shortsExpandTimer = null;

function toggleShortsExpand() {
  if (!el.mobileShortsOverlay) return;
  const expanded = el.mobileShortsOverlay.classList.toggle('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', String(expanded));
  clearTimeout(shortsExpandTimer);
  shortsExpandTimer = null;
  if (expanded) {
    shortsExpandTimer = setTimeout(collapseShortsExpand, 5000);
  }
}

function collapseShortsExpand() {
  clearTimeout(shortsExpandTimer);
  shortsExpandTimer = null;
  if (el.mobileShortsOverlay) el.mobileShortsOverlay.classList.remove('expanded');
  if (el.shortsMoreBtn) el.shortsMoreBtn.setAttribute('aria-expanded', 'false');
}

/* 영상 90도 회전 (시계 방향) — UI는 그대로 두고 영상만 회전.
   개별 transform 속성 rotate를 쓰면 드래그/스냅백 애니메이션(transform)과 자연스럽게 합성된다. */
function toggleVideoRotation() {
  if (!el.videoPlayer || el.videoPlayer.hidden) return;
  state.videoRotated = !state.videoRotated;
  el.videoPlayer.classList.toggle('is-rotated', state.videoRotated);
  if (el.shortsRotateBtn) el.shortsRotateBtn.setAttribute('aria-pressed', String(state.videoRotated));
}

function resetVideoRotation() {
  state.videoRotated = false;
  el.videoPlayer?.classList.remove('is-rotated');
  if (el.shortsRotateBtn) el.shortsRotateBtn.setAttribute('aria-pressed', 'false');
}

/* 비디오 첫 프레임을 캡처해 앰비언트 배경으로 채움 (레터박스 공간 제거) */
function tryCaptureAmbientFrame() {
  if (!el.ambientBackdrop || el.ambientBackdrop.classList.contains('active')) return;
  const video = el.videoPlayer;
  if (!video || video.hidden || !video.videoWidth || !video.videoHeight) return;
  try {
    const canvas = document.createElement('canvas');
    const scale = Math.min(1, 360 / Math.max(video.videoWidth, video.videoHeight));
    canvas.width = Math.max(2, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(2, Math.round(video.videoHeight * scale));
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
    el.ambientBackdrop.style.backgroundImage = `url("${canvas.toDataURL('image/jpeg', 0.72)}")`;
    el.ambientBackdrop.classList.add('active');
  } catch (_) {}
}

function showPlayerFeedback(text) {
  if (!el.playerFeedback) return;
  el.playerFeedback.textContent = text;
  el.playerFeedback.hidden = false;
  requestAnimationFrame(() => el.playerFeedback.classList.add('active'));
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    el.playerFeedback.classList.remove('active');
    setTimeout(() => { if (!el.playerFeedback.classList.contains('active')) el.playerFeedback.hidden = true; }, 200);
  }, 850);
}

function getPlaybackFileList() {
  const list = filteredAndSortedFiles();
  return list.length > 0 ? list : state.files;
}

function getActiveMediaElement() {
  if (el.videoPlayer && !el.videoPlayer.hidden) return el.videoPlayer;
  if (el.imageViewer && !el.imageViewer.hidden) return el.imageViewer;
  return null;
}

function animateMediaTransition(direction, callback) {
  const currentEl = getActiveMediaElement();
  const stage = el.mediaStage;

  if (!currentEl || !stage) {
    callback();
    return;
  }

  // Clear previous animation classes
  currentEl.className = currentEl.className.replace(/\banim-slide-[a-z-]+\b/g, '').trim();

  const outClass = `anim-slide-out-${direction}`;
  const inClass = `anim-slide-in-${direction}`;

  currentEl.classList.add(outClass);

  setTimeout(() => {
    callback();
    const newEl = getActiveMediaElement();
    if (newEl) {
      newEl.className = newEl.className.replace(/\banim-slide-[a-z-]+\b/g, '').trim();
      newEl.classList.add(inClass);
      setTimeout(() => {
        if (newEl) newEl.classList.remove(inClass);
      }, 230);
    }
  }, 80);
}

function playNextFile(direction = 'left') {
  const dir = typeof direction === 'string' ? direction : 'left';
  const list = getPlaybackFileList();
  if (!list.length) return;
  if (!state.selected) {
    openMediaSource(list[0]);
    return;
  }
  const currentIndex = list.findIndex((f) => f.id === state.selected.id);
  const nextIndex = (currentIndex + 1) % list.length;
  showPlayerFeedback('NEXT');
  state.pendingPlay = true;
  animateMediaTransition(dir, () => openMediaSource(list[nextIndex]));
}

function playPrevFile(direction = 'right') {
  const dir = typeof direction === 'string' ? direction : 'right';
  const list = getPlaybackFileList();
  if (!list.length) return;
  if (!state.selected) {
    openMediaSource(list[0]);
    return;
  }
  const currentIndex = list.findIndex((f) => f.id === state.selected.id);
  const prevIndex = (currentIndex - 1 + list.length) % list.length;
  showPlayerFeedback('PREV');
  state.pendingPlay = true;
  animateMediaTransition(dir, () => openMediaSource(list[prevIndex]));
}

async function playRandomFile(direction = 'up') {
  const dir = typeof direction === 'string' ? direction : 'up';
  // 랜덤 쇼츠도 대상 폴더의 전체 파일에서 뽑는다 — 남은 페이지를 먼저 모두 로드.
  if (!state.demo && !state.deepScan && state.nextPageToken) {
    await ensureAllPagesLoaded();
  }
  const list = getPlaybackFileList();
  if (!list.length) return;
  let nextFile;
  if (list.length === 1) {
    nextFile = list[0];
  } else {
    const candidates = list.filter((f) => !state.selected || f.id !== state.selected.id);
    nextFile = candidates[Math.floor(Math.random() * candidates.length)];
  }
  showPlayerFeedback('SHORTS');
  state.pendingPlay = true;
  animateMediaTransition(dir, () => openMediaSource(nextFile));
}

let touchStartX = 0;
let touchStartY = 0;
let touchStartTime = 0;
let isTouchActive = false;
let lockedAxis = null;
let lastTapTime = 0;
let lastTapZone = null;
let singleTapTimer = null;

function getTapZone(clientX, clientY) {
  const rect = el.mediaStage.getBoundingClientRect();
  if (!rect.width || !rect.height) return 'center';
  const nx = (clientX - rect.left) / rect.width;
  const ny = (clientY - rect.top) / rect.height;
  if (nx >= 0.3 && nx <= 0.7 && ny >= 0.3 && ny <= 0.7) return 'center';
  const edgeX = nx < 0.5 ? nx : 1 - nx;
  const edgeY = ny < 0.5 ? ny : 1 - ny;
  if (edgeX <= edgeY) return nx < 0.5 ? 'left' : 'right';
  return ny < 0.5 ? 'top' : 'bottom';
}

function setStageImmersive(on) {
  if (!el.playerModal) return;
  if (el.playerModal.classList.contains('immersive') === on) return;
  el.playerModal.classList.toggle('immersive', on);
  if (on) collapseShortsExpand();
  else resetControlsTimer();
}

function flashSeekHint(zone) {
  const hint = zone === 'left' ? el.seekHintLeft : zone === 'right' ? el.seekHintRight : null;
  if (!hint) return;
  hint.classList.remove('active');
  void hint.offsetWidth;
  hint.classList.add('active');
  setTimeout(() => hint.classList.remove('active'), 550);
}

function handleStageTap(clientX, clientY) {
  const now = Date.now();
  const zone = getTapZone(clientX, clientY);
  const isDoubleTap = (now - lastTapTime < 320) && zone === lastTapZone && (zone === 'left' || zone === 'right');
  lastTapTime = now;
  lastTapZone = zone;

  if (isDoubleTap) {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    seekRelative(zone === 'left' ? -10 : 10);
    flashSeekHint(zone);
    return;
  }

  // 가운데 탭 = 재생/일시정지 전용 (즉시 응답)
  if (zone === 'center') {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    togglePlayPause();
    return;
  }

  // 위/아래 에지 = 몰입 토글 (더블탭 제스처가 없어 즉시 실행)
  if (zone === 'top' || zone === 'bottom') {
    if (singleTapTimer) {
      clearTimeout(singleTapTimer);
      singleTapTimer = null;
    }
    setStageImmersive(!el.playerModal.classList.contains('immersive'));
    return;
  }

  // 좌/우 에지 = 더블탭 시크(±10초) 판별 창 뒤 몰입 토글
  if (singleTapTimer) clearTimeout(singleTapTimer);
  singleTapTimer = setTimeout(() => {
    singleTapTimer = null;
    setStageImmersive(!el.playerModal.classList.contains('immersive'));
  }, 280);
}

function setupTouchGestures() {
  const modal = el.playerModal || el.mediaStage;
  if (!modal) return;

  modal.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    // Don't hijack interaction on buttons, sliders, or seekbar
    if (e.target.closest('.seek-bar-container, .volume-slider, .volume-slider-wrap, button, input, select')) return;

    const activeEl = getActiveMediaElement();
    if (activeEl) {
      activeEl.style.transform = '';
      activeEl.className = activeEl.className.replace(/\banim-slide-[a-z-]+\b/g, '').trim();
    }
    el.mediaStage?.classList.remove('is-snapping');
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
    touchStartTime = Date.now();
    isTouchActive = true;
    lockedAxis = null;
  }, { passive: true });

  modal.addEventListener('touchmove', (e) => {
    if (!isTouchActive || e.touches.length !== 1) return;
    const rawX = e.touches[0].clientX - touchStartX;
    const rawY = e.touches[0].clientY - touchStartY;
    
    // Determine strict orthogonal axis once delta exceeds threshold
    if (lockedAxis === null) {
      if (Math.abs(rawX) > 6 || Math.abs(rawY) > 6) {
        lockedAxis = Math.abs(rawX) >= Math.abs(rawY) ? 'x' : 'y';
      }
    }

    const damp = (val) => Math.sign(val) * Math.pow(Math.abs(val), 0.88);
    const activeEl = getActiveMediaElement();

    if (lockedAxis === 'x') {
      // Pure Horizontal Rail (Y is strictly 0)
      const dragX = damp(rawX);
      el.mediaStage?.classList.add('is-dragging');
      if (activeEl) {
        // 90도 회전 상태에선 요소 좌표계가 화면과 어긋난다(요소 X→화면 아래, 요소 Y→화면 왼쪽).
        // 화면 방향 그대로 따라오게 드래그 변위를 요소 공간으로 치환해 적용한다.
        const tx = state.videoRotated ? 0 : dragX;
        const ty = state.videoRotated ? -dragX : 0;
        activeEl.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        activeEl.style.opacity = `${Math.max(0.35, 1 - Math.abs(dragX) / 450)}`;
      }
    } else if (lockedAxis === 'y') {
      // Pure Vertical Rail (X is strictly 0)
      const dragY = damp(rawY);
      el.mediaStage?.classList.add('is-dragging');
      if (activeEl) {
        const tx = state.videoRotated ? dragY : 0;
        const ty = state.videoRotated ? 0 : dragY;
        activeEl.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
        activeEl.style.opacity = `${Math.max(0.35, 1 - Math.abs(dragY) / 450)}`;
      }
    }
  }, { passive: true });

  modal.addEventListener('touchend', (e) => {
    if (!isTouchActive || e.changedTouches.length !== 1) return;
    isTouchActive = false;
    el.mediaStage?.classList.remove('is-dragging');

    const activeEl = getActiveMediaElement();
    const rawDiffX = e.changedTouches[0].clientX - touchStartX;
    const rawDiffY = e.changedTouches[0].clientY - touchStartY;
    const elapsed = Math.max(1, Date.now() - touchStartTime);

    // Tap (no axis locked, short duration, minimal movement) — shorts-style
    // double-tap seek on edges, single tap toggles playback. preventDefault
    // stops the synthetic click so onMediaStageClick never double-fires.
    if (lockedAxis === null && elapsed < 300 && Math.abs(rawDiffX) < 10 && Math.abs(rawDiffY) < 10) {
      e.preventDefault();
      handleStageTap(e.changedTouches[0].clientX, e.changedTouches[0].clientY);
      lockedAxis = null;
      return;
    }

    if (lockedAxis === 'x') {
      const distance = Math.abs(rawDiffX);
      const velocity = distance / elapsed;
      if (distance >= 45 || velocity >= 0.15) {
        if (activeEl) {
          activeEl.style.transform = '';
          activeEl.style.opacity = '';
        }
        if (rawDiffX < 0) playNextFile('left');
        else playPrevFile('right');
      } else {
        snapBackSpring(activeEl);
      }
    } else if (lockedAxis === 'y') {
      const distance = Math.abs(rawDiffY);
      const velocity = distance / elapsed;
      if (distance >= 45 || velocity >= 0.15) {
        if (activeEl) {
          activeEl.style.transform = '';
          activeEl.style.opacity = '';
        }
        if (rawDiffY < 0) playRandomFile('up');
        else playRandomFile('down');
      } else {
        snapBackSpring(activeEl);
      }
    } else {
      snapBackSpring(activeEl);
    }
    lockedAxis = null;
  }, { passive: false });
}

function snapBackSpring(activeEl) {
  if (activeEl) {
    el.mediaStage?.classList.add('is-snapping');
    activeEl.style.transform = 'translate3d(0, 0, 0)';
    activeEl.style.opacity = '1';
    setTimeout(() => {
      el.mediaStage?.classList.remove('is-snapping');
      activeEl.style.transform = '';
      activeEl.style.opacity = '';
    }, 230);
  }
}

function handlePlayerKeyboard(event) {
  if (el.playerSheet.hidden) return;
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

  const key = event.key.toLowerCase();
  const code = event.code;

  if (event.key === 'Escape') {
    if (isSpeedMenuOpen) {
      isSpeedMenuOpen = false;
      if (el.speedDropdown) el.speedDropdown.hidden = true;
      return;
    }
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      closePlayer();
    }
    return;
  }

  if (key === 'f') {
    event.preventDefault();
    toggleFullscreen();
    return;
  }

  if (isVideo) {
    if (event.key === ' ' || key === 'k') {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (key === 'm') {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (event.key === 'ArrowLeft' || key === 'j') {
      event.preventDefault();
      seekRelative(-10);
      return;
    }

    if (event.key === 'ArrowRight' || key === 'l') {
      event.preventDefault();
      seekRelative(10);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      el.videoPlayer.muted = false;
      el.videoPlayer.volume = Math.min(1, +(el.videoPlayer.volume + 0.1).toFixed(2));
      showPlayerFeedback(`VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      el.videoPlayer.volume = Math.max(0, +(el.videoPlayer.volume - 0.1).toFixed(2));
      showPlayerFeedback(`VOL ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (code && code.startsWith('Digit') && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const digit = Number(code.replace('Digit', ''));
      if (!isNaN(digit) && el.videoPlayer.duration) {
        event.preventDefault();
        el.videoPlayer.currentTime = (digit / 10) * el.videoPlayer.duration;
        showPlayerFeedback(`SEEK ${digit * 10}%`);
        updateVideoProgress();
      }
    }
  }
}

function openMediaSource(file) {
  if (!file) return;
  state.selected = file;
  if (el.playerTitle) el.playerTitle.textContent = file.name || '미디어 파일';
  if (el.mobileShortsTitle) el.mobileShortsTitle.textContent = file.name || '미디어 파일';
  if (el.codecNote) el.codecNote.textContent = 'Google Drive 원본 파일의 바이트를 1:1 무변환 실시간 스트리밍 중입니다. (손실 없음)';
  const isVideo = file.mimeType?.startsWith('video/');
  if (el.pipButton) el.pipButton.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.ctrlPip) el.ctrlPip.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.shortsPipBtn) el.shortsPipBtn.hidden = !document.pictureInPictureEnabled || !isVideo;
  if (el.shortsRotateBtn) el.shortsRotateBtn.hidden = !isVideo;

  resetMediaElements();
  collapseShortsExpand();
  resetVideoRotation();

  if (el.ambientBackdrop) {
    const thumb = file.thumbnailLink || generatedThumbnailCache.get(file.id);
    if (thumb) {
      el.ambientBackdrop.style.backgroundImage = `url("${thumb}")`;
      el.ambientBackdrop.classList.add('active');
    }
  }

  if (isVideo) {
    const poster = file.thumbnailLink || generatedThumbnailCache.get(file.id) || '';
    if (poster) el.videoPlayer.poster = poster;
  }

  const session = state.mediaSession;
  state.mediaAttempt = 'range';
  state.lastProxyError = null;
  updateQualityDisplay();
  showMediaLoading('원본 구간 스트림 준비 중');

  if (state.demo) {
    if (isVideo) {
      showMediaError('데모 화면에서는 실제 Drive 영상을 요청하지 않습니다.', { showDrive: false });
    } else {
      state.mediaAttempt = 'blob';
      updateQualityDisplay();
      el.imageViewer.hidden = false;
      el.imageViewer.alt = file.name || '데모 이미지';
      el.imageViewer.src = demoImageDataUrl();
    }
    return;
  }

  if (!hasUsableToken()) {
    showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    return;
  }
  sendTokenToWorker();
  const mediaUrl = buildMediaUrl(file);

  if (isVideo) {
    el.videoPlayer.hidden = false;
    el.videoPlayer.src = mediaUrl;
    el.videoPlayer.load();
  } else {
    el.imageViewer.hidden = false;
    el.imageViewer.alt = file.name || '원본 이미지';
    el.imageViewer.src = mediaUrl;
  }

  window.setTimeout(() => {
    if (session === state.mediaSession && state.mediaAttempt === 'range' && !el.mediaLoading.hidden) {
      el.mediaLoadingText.textContent = '원본 응답을 기다리는 중입니다…';
    }
  }, 5000);
}

function buildMediaUrl(file) {
  const base = new URL('.', location.href);
  const url = new URL(`__drive_media/${encodeURIComponent(file.id)}`, base);
  if (file.mimeType) url.searchParams.set('mime', file.mimeType);
  if (file.size) url.searchParams.set('size', file.size);
  if (file.resourceKey) url.searchParams.set('resourceKey', file.resourceKey);
  return url.href;
}

function buildDriveMediaApiUrl(file) {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  url.searchParams.set('alt', 'media');
  url.searchParams.set('supportsAllDrives', 'true');
  url.searchParams.set('acknowledgeAbuse', 'true');
  return url.href;
}

async function handleMediaElementError(kind) {
  const element = kind === 'video' ? el.videoPlayer : el.imageViewer;
  if (!element.getAttribute('src') || !state.selected) return;
  if (state.mediaAttempt === 'blob-loading' || state.mediaAttempt === 'drive-preview') return;

  if (!navigator.onLine) {
    showMediaError('네트워크가 오프라인입니다. 연결 후 다시 시도하세요.');
    return;
  }
  if (!hasUsableToken()) {
    showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    return;
  }
  if (state.lastProxyError?.status === 403) {
    showMediaError('Drive에서 원본 전송을 거부했습니다. 파일의 다운로드 허용 설정과 계정 권한을 확인하세요.');
    return;
  }

  if (state.mediaAttempt === 'range') {
    await startOriginalBlobFallback(state.selected, kind, state.mediaSession);
    return;
  }

  if (state.mediaAttempt === 'blob') {
    showDrivePreview(state.selected, '원본 전체를 임시 버퍼에 불러왔지만 이 브라우저가 코덱을 해독하지 못했습니다. Drive 호환 재생기로 전환했습니다.');
  }
}

async function startOriginalBlobFallback(file, kind, session) {
  const size = Number(file.size || 0);
  const limit = isMobileDevice() ? MOBILE_BLOB_LIMIT : DESKTOP_BLOB_LIMIT;
  if (size && size > limit) {
    showDrivePreview(file, `원본 구간 스트림이 실패했고 파일 크기 ${formatBytes(size)}가 이 기기의 안전한 임시 버퍼 한도를 넘습니다. Drive 호환 재생기로 전환했습니다.`);
    return;
  }

  state.mediaAttempt = 'blob-loading';
  state.lastProxyError = null;
  updateQualityDisplay();
  clearDirectMediaSources();
  showMediaLoading('직접 스트림 실패 — 원본을 메모리에 임시로 불러오는 중');
  state.mediaAbortController = new AbortController();

  try {
    const headers = {};
    if (file.resourceKey) headers['X-Goog-Drive-Resource-Keys'] = `${file.id}/${file.resourceKey}`;
    const response = await driveFetch(buildDriveMediaApiUrl(file), {
      headers,
      signal: state.mediaAbortController.signal
    });
    const blob = await readResponseIntoBlob(response, file, session);
    if (session !== state.mediaSession) return;

    state.mediaBlobUrl = URL.createObjectURL(blob);
    state.mediaAttempt = 'blob';
    updateQualityDisplay();
    el.codecNote.textContent = '구간 스트림 대신 원본 바이너리 전체를 메모리 버퍼에 임시 저장하여 100% 무손실로 재생 중입니다. 플레이어를 닫으면 즉시 해제됩니다.';

    if (kind === 'video') {
      el.videoPlayer.hidden = false;
      el.videoPlayer.src = state.mediaBlobUrl;
      el.videoPlayer.load();
    } else {
      el.imageViewer.hidden = false;
      el.imageViewer.alt = file.name || '원본 이미지';
      el.imageViewer.src = state.mediaBlobUrl;
    }
  } catch (error) {
    if (error.name === 'AbortError' || session !== state.mediaSession) return;
    console.error('Original blob fallback failed', error);
    if (error.status === 401) {
      clearToken(false);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (error.status === 403) {
      showMediaError('Drive에서 원본 파일 다운로드를 거부했습니다. 파일 권한을 확인하세요.');
    } else {
      showDrivePreview(file, '원본 임시 버퍼 전송도 완료하지 못해 Drive 호환 재생기로 전환했습니다.');
    }
  }
}

async function readResponseIntoBlob(response, file, session) {
  const total = Number(response.headers.get('Content-Length')) || Number(file.size) || 0;
  if (!response.body?.getReader) return response.blob();

  const reader = response.body.getReader();
  const chunks = [];
  let received = 0;
  let lastUpdate = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (session !== state.mediaSession) {
      await reader.cancel();
      throw new DOMException('Media session changed', 'AbortError');
    }
    chunks.push(value);
    received += value.byteLength;
    const now = performance.now();
    if (now - lastUpdate > 180) {
      const progress = total ? ` ${Math.min(100, Math.round((received / total) * 100))}%` : '';
      el.mediaLoadingText.textContent = `원본 임시 버퍼 ${formatBytes(received)}${progress}`;
      lastUpdate = now;
    }
  }
  return new Blob(chunks, { type: file.mimeType || response.headers.get('Content-Type') || 'application/octet-stream' });
}

function showDrivePreview(file, reason) {
  clearDirectMediaSources();
  state.mediaAttempt = 'drive-preview';
  updateQualityDisplay();
  showMediaLoading('Drive 호환 재생기로 전환 중');
  el.drivePreview.hidden = false;
  el.drivePreview.src = buildDrivePreviewUrl(file);
  el.codecNote.textContent = `${reason} 이 모드는 Google Drive의 압축 변환본을 재생하므로 원본보다 화질이 낮을 수 있습니다.`;
}

function buildDrivePreviewUrl(file) {
  const url = new URL(`https://drive.google.com/file/d/${encodeURIComponent(file.id)}/preview`);
  if (file.resourceKey) url.searchParams.set('resourcekey', file.resourceKey);
  return url.href;
}

function openSelectedInDrive() {
  if (!state.selected) return;
  const fallback = `https://drive.google.com/file/d/${encodeURIComponent(state.selected.id)}/view`;
  window.open(state.selected.webViewLink || fallback, '_blank', 'noopener,noreferrer');
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

function requestDeleteFile() {
  if (!state.selected || state.deleting) return;
  if (el.deleteDialog && el.deleteFileName) {
    el.deleteFileName.textContent = state.selected.name || '이름 없는 파일';
    if (!el.deleteDialog.open) el.deleteDialog.showModal();
  }
}

async function performDeleteFile() {
  const file = state.selected;
  if (!file || state.deleting) return;
  state.deleting = true;
  if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = true;
  setButtonLoading(el.deleteConfirmButton, true, '삭제 중…');
  try {
    // 삭제 후에도 플레이어를 유지하고 다음 영상으로 자연스럽게 넘어가기 위해
    // 제거 전 재생 순서를 먼저 capturing 한다.
    const order = getPlaybackFileList();
    const removedIndex = order.findIndex((f) => f.id === file.id);
    if (state.demo) {
      // 실제 환경의 네트워크 지연을 반영해 로딩 상태가 보이도록 한다.
      await new Promise((resolve) => setTimeout(resolve, 700));
      state.files = state.files.filter((f) => f.id !== file.id);
      if (state.treeCache) state.treeCache = buildTreeIndexes(state.treeCache.items.filter((f) => f.id !== file.id));
      if (el.deleteDialog?.open) el.deleteDialog.close();
      collapseShortsExpand();
      computeAndRenderSubtree();
      showToast('휴지통으로 이동했습니다. (데모 시뮬레이션)');
      playNextAfterRemoval(order, removedIndex, file.id);
      return;
    }
    const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?supportsAllDrives=true`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trashed: true })
    });
    await response.json().catch(() => ({}));
    state.files = state.files.filter((f) => f.id !== file.id);
    shuffledOrderMap.delete(file.id);
    generatedThumbnailCache.delete(file.id);
    if (state.treeCache) {
      state.treeCache = buildTreeIndexes(state.treeCache.items.filter((f) => f.id !== file.id));
    }
    if (el.deleteDialog?.open) el.deleteDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();
    showToast('휴지통으로 이동했습니다. Drive 휴지통에서 30일 내 복구할 수 있습니다.');
    playNextAfterRemoval(order, removedIndex, file.id);
  } catch (error) {
    console.error('Delete failed', error);
    if (el.deleteDialog?.open) el.deleteDialog.close();
    if (error.status === 401) {
      clearToken(false);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (error.status === 403) {
      openPermissionGuide();
    } else {
      showToast(`삭제하지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    state.deleting = false;
    if (el.deleteConfirmButton) el.deleteConfirmButton.disabled = false;
    setButtonLoading(el.deleteConfirmButton, false);
  }
}

/* 삭제/이동으로 현재 파일이 목록에서 사라져도 플레이어를 유지하고
   다음 영상을 자동 재생한다. 남은 파일이 없을 때만 플레이어를 닫는다. */
function playNextAfterRemoval(order, removedIndex, removedId) {
  if (el.playerSheet.hidden) return;
  let next = null;
  for (let i = removedIndex + 1; i < order.length; i++) {
    if (order[i].id !== removedId) { next = order[i]; break; }
  }
  if (!next) {
    const remaining = order.filter((f) => f.id !== removedId);
    next = remaining[0] || null;
  }
  if (!next) {
    closePlayer();
    return;
  }
  state.pendingPlay = true;
  animateMediaTransition('left', () => openMediaSource(next));
}

/* 폴더 이동 — 전체 폴더 목록을 1회 수집해 순수 폴더명 목록으로 선택 UI 제공 */
async function requestMoveFile() {
  if (!state.selected || state.moving) return;
  state.moveTargetFolderId = null;
  if (el.moveFileName) el.moveFileName.textContent = state.selected.name || '이름 없는 파일';
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  if (el.moveSearchInput) el.moveSearchInput.value = '';
  if (el.moveDialog && !el.moveDialog.open) el.moveDialog.showModal();
  renderMoveFolderList('');
  try {
    await ensureSelectedFileParents();
    await ensureFolderIndex();
    if (el.moveDialog?.open) renderMoveFolderList(el.moveSearchInput?.value || '');
  } catch (error) {
    console.error('Move dialog failed', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    if (error.status === 401) {
      clearToken(false);
      showToast('Google 인증이 만료됐습니다. 다시 시도해 주세요.');
    } else {
      showToast(`폴더 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`);
    }
  }
}

async function ensureSelectedFileParents() {
  const file = state.selected;
  if (!file || Array.isArray(file.parents) && file.parents.length) return;
  if (state.demo) {
    file.parents = ['root'];
    return;
  }
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?fields=parents&supportsAllDrives=true`);
  const data = await response.json();
  file.parents = Array.isArray(data.parents) && data.parents.length ? data.parents : [state.rootFolderId || 'root'];
}

async function ensureFolderIndex() {
  if (state.folderIndex) return state.folderIndex;
  if (state.loadingFolderIndex) {
    await new Promise((resolve) => {
      const tick = () => state.folderIndex || !state.loadingFolderIndex ? resolve() : setTimeout(tick, 80);
      tick();
    });
    return state.folderIndex;
  }
  if (state.demo || state.treeCache) {
    // 데모/딥스캔 트리 캐시가 이미 전체 폴더 구조를 알고 있다.
    await ensureTreeCache();
    state.folderIndex = state.treeCache;
    return state.folderIndex;
  }
  state.loadingFolderIndex = true;
  try {
    // 루트 별칭이 폴백('root')으로 남아 있으면 실제 루트 ID를 다시 해소한다.
    // 실패해도 고아 시딩(renderMoveFolderList)이 불일치를 흡수한다.
    if (!state.rootFolderId || state.rootFolderId === 'root') {
      try {
        const about = await driveFetch(`${DRIVE_API}/about?fields=rootFolderId`);
        const info = await about.json();
        if (info.rootFolderId) state.rootFolderId = info.rootFolderId;
      } catch (_) { /* 폴백 유지 */ }
    }
    const folders = [];
    let pageToken = null;
    do {
      const params = new URLSearchParams({
        pageSize: String(DRIVE_PAGE_SIZE),
        q: `trashed = false and mimeType = '${FOLDER_MIME}'`,
        spaces: 'drive',
        supportsAllDrives: 'true',
        includeItemsFromAllDrives: 'true',
        fields: 'nextPageToken,files(id,name,parents)'
      });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`);
      const data = await response.json();
      folders.push(...(Array.isArray(data.files) ? data.files : []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);
    state.folderIndex = buildTreeIndexes(folders);
    return state.folderIndex;
  } finally {
    state.loadingFolderIndex = false;
  }
}

function renderMoveFolderList(filterRaw) {
  if (!el.moveFolderList) return;
  el.moveFolderList.replaceChildren();
  const index = state.folderIndex;
  if (!index) {
    const loading = document.createElement('div');
    loading.className = 'move-folder-empty';
    loading.textContent = '폴더 목록을 불러오는 중…';
    el.moveFolderList.appendChild(loading);
    return;
  }
  const filter = String(filterRaw || '').trim().toLocaleLowerCase('ko');
  const rootId = state.rootFolderId || 'root';
  const currentParents = state.selected?.parents || [];
  // 순수하게 폴더명만 표시한다 — 경로 문자열·중복 텍스트 없이,
  // 계층은 들여쓰기(깊이)로만 전달하고 현재 위치는 작은 배지로 표시한다.
  const rows = [{ id: 'root', name: '내 드라이브', depth: 0 }];
  const seen = new Set(['root']);
  const { foldersByParent, foldersById } = index;
  const queue = [];
  const pushIfNew = (folder, depth) => {
    if (seen.has(folder.id)) return;
    seen.add(folder.id);
    queue.push({ folder, depth });
  };
  [...(foldersByParent.get(rootId) || []), ...(foldersByParent.get('root') || [])].forEach((folder) => {
    pushIfNew(folder, 1);
  });
  // 루트 별칭 불일치·공유 드라이브 등 어떤 이유로 루트 직계 매칭이 빠져도
  // 부모가 폴더 인덱스에 없는 최상위 폴더를 전부 루트 직계로 승격해
  // 전체 트리가 항상 나타나도록 보장한다.
  foldersById.forEach((folder) => {
    const parent = folder.parents?.[0] || 'root';
    if (!foldersById.has(parent) && parent !== rootId && parent !== 'root') {
      pushIfNew(folder, 1);
    }
  });
  while (queue.length) {
    const { folder, depth } = queue.shift();
    rows.push({ id: folder.id, name: folder.name || '이름 없는 폴더', depth });
    (foldersByParent.get(folder.id) || []).forEach((child) => {
      pushIfNew(child, depth + 1);
    });
  }
  const filtered = filter
    ? rows.filter((row) => row.name.toLocaleLowerCase('ko').includes(filter))
    : rows;
  if (!filtered.length) {
    const empty = document.createElement('div');
    empty.className = 'move-folder-empty';
    empty.textContent = '일치하는 폴더가 없습니다.';
    el.moveFolderList.appendChild(empty);
    return;
  }
  const fragment = document.createDocumentFragment();
  filtered.slice(0, 300).forEach((row) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'move-folder-row';
    button.setAttribute('role', 'option');
    const resolvedId = row.id === 'root' ? rootId : row.id;
    const isCurrent = currentParents.includes(resolvedId);
    if (isCurrent) {
      button.classList.add('current');
      button.disabled = true;
    }
    if (state.moveTargetFolderId === row.id) button.classList.add('selected');
    button.style.setProperty('--depth', String(row.depth));

    const name = document.createElement('span');
    name.className = 'move-folder-name';
    name.textContent = row.name;
    button.appendChild(name);
    if (isCurrent) {
      const badge = document.createElement('span');
      badge.className = 'move-folder-current';
      badge.textContent = '현재 위치';
      button.appendChild(badge);
    }
    button.addEventListener('click', () => {
      state.moveTargetFolderId = row.id;
      el.moveFolderList.querySelectorAll('.move-folder-row').forEach((item) => item.classList.remove('selected'));
      button.classList.add('selected');
      if (el.moveConfirmButton) el.moveConfirmButton.disabled = false;
    });
    fragment.appendChild(button);
  });
  el.moveFolderList.appendChild(fragment);
}

async function performMoveFile() {
  const file = state.selected;
  const targetRowId = state.moveTargetFolderId;
  if (!file || !targetRowId || state.moving) return;
  const target = targetRowId === 'root' ? (state.rootFolderId || 'root') : targetRowId;
  const currentParents = Array.isArray(file.parents) && file.parents.length
    ? file.parents
    : [state.rootFolderId || 'root'];
  if (currentParents.includes(target)) {
    showToast('이 파일은 이미 해당 폴더에 있습니다.');
    if (el.moveDialog?.open) el.moveDialog.close();
    return;
  }
  state.moving = true;
  if (el.moveConfirmButton) el.moveConfirmButton.disabled = true;
  setButtonLoading(el.moveConfirmButton, true, '이동 중…');
  try {
    const order = getPlaybackFileList();
    const removedIndex = order.findIndex((f) => f.id === file.id);
    if (state.demo) {
      // 실제 환경의 네트워크 지연을 반영해 로딩 상태가 보이도록 한다.
      await new Promise((resolve) => setTimeout(resolve, 700));
      file.parents = [target];
      state.files = state.files.filter((f) => f.id !== file.id);
      if (state.treeCache) state.treeCache = buildTreeIndexes(state.treeCache.items);
      if (el.moveDialog?.open) el.moveDialog.close();
      collapseShortsExpand();
      computeAndRenderSubtree();
      showToast('폴더로 이동했습니다. (데모 시뮬레이션)');
      playNextAfterRemoval(order, removedIndex, file.id);
      return;
    }
    const params = new URLSearchParams({
      addParents: target,
      removeParents: currentParents.join(','),
      supportsAllDrives: 'true',
      fields: 'id,parents'
    });
    await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(file.id)}?${params.toString()}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    file.parents = [target];
    state.files = state.files.filter((f) => f.id !== file.id);
    shuffledOrderMap.delete(file.id);
    if (state.treeCache) {
      state.treeCache = buildTreeIndexes(state.treeCache.items);
    }
    if (el.moveDialog?.open) el.moveDialog.close();
    collapseShortsExpand();
    if (state.deepScan && state.treeCache) computeAndRenderSubtree();
    else renderFiles();
    showToast('폴더로 이동했습니다.');
    playNextAfterRemoval(order, removedIndex, file.id);
  } catch (error) {
    console.error('Move failed', error);
    if (el.moveDialog?.open) el.moveDialog.close();
    if (error.status === 401) {
      clearToken(false);
      showMediaError('Google 인증이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    } else if (error.status === 403) {
      openPermissionGuide();
    } else {
      showToast(`이동하지 못했습니다: ${humanizeDriveError(error)}`);
    }
  } finally {
    state.moving = false;
    if (el.moveConfirmButton && state.moveTargetFolderId) el.moveConfirmButton.disabled = false;
    setButtonLoading(el.moveConfirmButton, false);
  }
}

function openPermissionGuide() {
  if (el.permissionDialog && !el.permissionDialog.open) el.permissionDialog.showModal();
}

function onMediaReady() {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  updateQualityDisplay();
  if (state.pendingPlay) {
    state.pendingPlay = false;
    if (el.videoPlayer && !el.videoPlayer.hidden) {
      // 쇼츠 패턴: 미리보기를 열면 항상 재생 상태로 시작한다.
      // 제스처 활성 창을 벗어난 첫 시도가 거부되면 한 번 더 시도한다.
      el.videoPlayer.play().catch(() => {
        setTimeout(() => el.videoPlayer.play().catch(() => {}), 350);
      });
    }
  }
}

function setStreamMode(mode, label) {
  if (el.streamModeLabel) el.streamModeLabel.dataset.mode = mode;
  if (el.streamModeText) el.streamModeText.textContent = label;
}

function getResolutionCategory(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  if (maxDim >= 3840 || minDim >= 2160) return '4K 2160p';
  if (maxDim >= 2560 || minDim >= 1440) return 'QHD 1440p';
  if (maxDim >= 1920 || minDim >= 1080) return 'FHD 1080p';
  if (maxDim >= 1200 || minDim >= 700) return 'HD 720p';
  if (maxDim >= 800 || minDim >= 450) return 'SD 480p';
  return 'SD';
}

function updateQualityDisplay() {
  const file = state.selected;
  if (!file) return;

  const mode = state.mediaAttempt;
  const isVideo = file.mimeType?.startsWith('video/');
  const meta = file.videoMediaMetadata || file.imageMediaMetadata;
  const metaW = Number(meta?.width) || 0;
  const metaH = Number(meta?.height) || 0;
  const metaCat = getResolutionCategory(metaW, metaH);

  let liveW = 0;
  let liveH = 0;
  if (isVideo && el.videoPlayer && !el.videoPlayer.hidden) {
    liveW = el.videoPlayer.videoWidth || 0;
    liveH = el.videoPlayer.videoHeight || 0;
  } else if (!isVideo && el.imageViewer && !el.imageViewer.hidden) {
    liveW = el.imageViewer.naturalWidth || 0;
    liveH = el.imageViewer.naturalHeight || 0;
  }

  const effectiveW = liveW || metaW;
  const effectiveH = liveH || metaH;
  const effectiveCat = getResolutionCategory(effectiveW, effectiveH);

  if (mode === 'drive-preview') {
    setStreamMode('drive', 'Drive 호환 재생');
    if (el.qualityBadge) {
      el.qualityBadge.dataset.quality = 'preview';
      el.qualityBadge.textContent = '· 변환본';
    }
    if (el.mediaResolution) {
      el.mediaResolution.textContent = metaW && metaH
        ? `가변 해상도 (원본: ${metaW}×${metaH} ${metaCat})`
        : 'Drive 가변 변환 해상도';
    }
  } else if (mode === 'blob' || mode === 'blob-loading') {
    setStreamMode('buffer', '원본 임시 버퍼');
    if (el.qualityBadge) {
      el.qualityBadge.dataset.quality = 'buffer';
      el.qualityBadge.textContent = effectiveCat ? `· ${effectiveCat} (원본 1:1)` : '· 원본 1:1';
    }
    if (el.mediaResolution) {
      if (effectiveW && effectiveH) {
        const matchTag = (metaW && metaH && liveW && liveH && metaW === liveW && metaH === liveH) ? ' · 원본 1:1' : '';
        el.mediaResolution.textContent = `${effectiveW} × ${effectiveH}${effectiveCat ? ` (${effectiveCat}${matchTag})` : ''}`;
      } else {
        el.mediaResolution.textContent = '원본 해상도 분석 중…';
      }
    }
  } else {
    // 'range' mode (Tier 1)
    setStreamMode('range', '100% 원본 스트림');
    if (el.qualityBadge) {
      el.qualityBadge.dataset.quality = 'original';
      el.qualityBadge.textContent = effectiveCat ? `· ${effectiveCat} (원본 1:1)` : '· 원본 1:1';
    }
    if (el.mediaResolution) {
      if (effectiveW && effectiveH) {
        const matchTag = (metaW && metaH && liveW && liveH && metaW === liveW && metaH === liveH) ? ' · 원본 1:1' : '';
        el.mediaResolution.textContent = `${effectiveW} × ${effectiveH}${effectiveCat ? ` (${effectiveCat}${matchTag})` : ''}`;
      } else {
        el.mediaResolution.textContent = '원본 해상도 분석 중…';
      }
    }
  }

  if (el.mediaFileSizeType) {
    const sizeStr = formatBytes(file.size);
    const mimeStr = friendlyMime(file.mimeType);
    el.mediaFileSizeType.textContent = [sizeStr, mimeStr].filter(Boolean).join(' · ') || '정보 없음';
  }
}

function showMediaLoading(message) {
  el.mediaLoadingText.textContent = message;
  el.mediaLoading.hidden = false;
  el.mediaError.hidden = true;
}

function showMediaError(message, { showDrive = true } = {}) {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = false;
  el.mediaErrorMessage.textContent = message;
  el.openDriveButton.hidden = !showDrive;
}

function retryMedia() {
  if (!state.selected) return;
  if (!hasUsableToken() && !state.demo) {
    state.retryAfterAuth = true;
    requestAccessToken();
    return;
  }
  openMediaSource(state.selected);
}

function closePlayer() {
  if (el.playerSheet.hidden) return;
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
    else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
  }
  resetMediaElements();
  collapseShortsExpand();
  resetVideoRotation();
  setStageImmersive(false);
  el.playerSheet.hidden = true;
  document.body.style.overflow = '';
  state.selected = null;
}

function clearDirectMediaSources() {
  el.videoPlayer.pause();
  el.videoPlayer.removeAttribute('src');
  el.videoPlayer.load();
  el.videoPlayer.hidden = true;
  el.imageViewer.removeAttribute('src');
  el.imageViewer.alt = '';
  el.imageViewer.hidden = true;
  if (state.mediaBlobUrl) {
    URL.revokeObjectURL(state.mediaBlobUrl);
    state.mediaBlobUrl = null;
  }
}

function resetMediaElements() {
  state.mediaSession += 1;
  state.mediaAbortController?.abort();
  state.mediaAbortController = null;
  clearDirectMediaSources();
  if (el.ambientBackdrop) {
    el.ambientBackdrop.classList.remove('active');
    el.ambientBackdrop.style.backgroundImage = '';
  }
  if (el.mobileShortsProgressBar) {
    el.mobileShortsProgressBar.style.width = '0%';
  }
  el.drivePreview.hidden = true;
  el.drivePreview.src = 'about:blank';
  el.mediaError.hidden = true;
  el.openDriveButton.hidden = false;
  el.mediaLoading.hidden = false;
  el.mediaLoadingText.textContent = '원본 스트림 준비 중';
  state.mediaAttempt = 'idle';
  state.lastProxyError = null;
}

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || matchMedia('(max-width: 600px)').matches;
}

function openSettings(scrollToHelp) {
  el.settingsClientId.value = state.clientId;
  if (!el.settingsDialog.open) el.settingsDialog.showModal();
  if (scrollToHelp) requestAnimationFrame(() => el.setupHelpSection.scrollIntoView({ behavior: 'smooth', block: 'start' }));
}

function saveSettings() {
  const value = el.settingsClientId.value.trim();
  if (value && !validateClientId(value)) {
    showToast('올바른 웹 OAuth 클라이언트 ID가 아닙니다.');
    return;
  }
  const changed = value !== state.clientId;
  state.clientId = value;
  el.clientIdInput.value = value;
  if (value) localStorage.setItem(CLIENT_ID_KEY, value);
  else localStorage.removeItem(CLIENT_ID_KEY);
  if (changed) {
    state.tokenClient = null;
    clearToken(false);
  }
  showToast('이 기기의 연결 설정을 저장했습니다.');
}

function disconnect() {
  const token = state.token;
  clearToken(true);
  state.files = [];
  state.nextPageToken = null;
  state.selected = null;
  closePlayer();
  if (token && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(token, () => {});
  }
  if (el.settingsDialog.open) el.settingsDialog.close();
  showSetup();
  showToast('Google Drive 연결을 해제했습니다.');
}

function clearToken(notifyWorker) {
  state.token = null;
  state.expiresAt = 0;
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch (_) {}
  if (notifyWorker) {
    navigator.serviceWorker.controller?.postMessage({ type: 'CLEAR_TOKEN' });
    state.serviceWorkerRegistration?.active?.postMessage({ type: 'CLEAR_TOKEN' });
  }
}

async function pasteClientId() {
  try {
    const text = await navigator.clipboard.readText();
    el.clientIdInput.value = text.trim();
    clearClientIdError();
  } catch (_) {
    showToast('클립보드 권한이 없습니다. 입력란을 길게 눌러 붙여넣으세요.');
  }
}

async function copyOrigin() {
  try {
    await navigator.clipboard.writeText(location.origin);
    showToast('현재 원본 주소를 복사했습니다.');
  } catch (_) {
    showToast('복사하지 못했습니다. 주소를 직접 선택해 복사하세요.');
  }
}

function showSetup() {
  el.setupView.hidden = false;
  el.libraryView.hidden = true;
  updateConnectionBadge();
}

function showLibrary() {
  el.setupView.hidden = true;
  el.libraryView.hidden = false;
}

function setConnectBusy(busy) {
  el.connectButton.disabled = busy;
  const label = el.connectButton.querySelector('span');
  if (label) label.textContent = busy ? 'Google 연결 대기 중…' : 'Google Drive에 연결';
}

function updateConnectionBadge(forcedState) {
  const badgeState = forcedState || (!navigator.onLine ? 'offline' : hasUsableToken() || state.demo ? 'online' : 'offline');
  el.connectionBadge.dataset.state = badgeState;
  const label = el.connectionBadge.querySelector('.badge-text') || el.connectionBadge.querySelector('span:last-child');
  if (label) {
    if (badgeState === 'busy') label.textContent = '연결 중…';
    else if (!navigator.onLine) label.textContent = '오프라인';
    else if (badgeState === 'online') label.textContent = state.demo ? '데모 모드' : 'Drive 연결됨';
    else label.textContent = '연결 안 됨';
  }
}

function hasUsableToken() {
  return Boolean(state.token && Date.now() < state.expiresAt - TOKEN_SKEW_MS);
}

function validateClientId(value) {
  return /^\d+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(value);
}

function setClientIdError(message) {
  el.clientIdHint.textContent = message;
  el.clientIdHint.classList.add('error');
  el.clientIdInput.setAttribute('aria-invalid', 'true');
}

function clearClientIdError() {
  el.clientIdHint.textContent = 'Drive API와 승인된 JavaScript 원본 설정이 필요합니다.';
  el.clientIdHint.classList.remove('error');
  el.clientIdInput.removeAttribute('aria-invalid');
}

function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

function humanizeDriveError(error) {
  if (error.status === 401) return '인증이 만료됐습니다.';
  if (error.status === 403) return 'Drive API 사용 설정, OAuth 범위, 또는 계정 권한을 확인하세요.';
  return error.message || '알 수 없는 오류';
}

function dedupeFiles(files) {
  return [...new Map(files.map((file) => [file.id, file])).values()];
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unit = -1;
  do { size /= 1024; unit += 1; } while (size >= 1024 && unit < units.length - 1);
  return `${size >= 100 ? size.toFixed(0) : size >= 10 ? size.toFixed(1) : size.toFixed(2)} ${units[unit]}`;
}

function formatDuration(secondsValue) {
  const total = Math.max(0, Math.round(Number(secondsValue) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function resolutionText(file) {
  const metadata = file.videoMediaMetadata || file.imageMediaMetadata;
  const width = Number(metadata?.width);
  const height = Number(metadata?.height);
  return width && height ? `${width}×${height}` : '';
}

function friendlyMime(mime) {
  if (!mime) return '알 수 없음';
  const known = {
    'video/mp4': 'MP4',
    'video/quicktime': 'MOV',
    'video/x-matroska': 'MKV',
    'video/webm': 'WebM',
    'image/jpeg': 'JPEG',
    'image/png': 'PNG',
    'image/heic': 'HEIC',
    'image/heif': 'HEIF',
    'image/webp': 'WebP',
    'image/gif': 'GIF'
  };
  return known[mime] || mime.split('/').pop().toUpperCase();
}

function startDemoMode() {
  const demoItems = [
    { id: 'demo-folder-1', name: '여행 원본 클립', mimeType: FOLDER_MIME, parents: ['root'] },
    { id: 'demo-folder-2', name: '가족 사진 아카이브', mimeType: FOLDER_MIME, parents: ['root'] },
    { id: 'demo-folder-1-1', name: '2025 도쿄 원본', mimeType: FOLDER_MIME, parents: ['demo-folder-1'] },
    { id: 'demo-video-1', name: '서울 야간 산책 — 4K.mov', mimeType: 'video/quicktime', size: '4873258598', modifiedTime: '2026-08-15T08:30:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(0), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '437000' } },
    { id: 'demo-image-1', name: '한강 원본 사진.heic', mimeType: 'image/heic', size: '12845032', modifiedTime: '2026-08-14T12:10:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(1), imageMediaMetadata: { width: 5712, height: 4284 } },
    { id: 'demo-video-2', name: '강의 녹화 03.mp4', mimeType: 'video/mp4', size: '2137483648', modifiedTime: '2026-08-13T05:40:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(2), videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '3842000' } },
    { id: 'demo-video-3', name: '여행 클립 — HEVC.mp4', mimeType: 'video/mp4', size: '876523100', modifiedTime: '2026-08-08T16:00:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(3), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '187000' } },
    { id: 'demo-video-4', name: '도쿄 골목 — 세로 쇼츠.mp4', mimeType: 'video/mp4', size: '412556320', modifiedTime: '2026-08-07T09:00:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1-1'], thumbnailLink: demoImageDataUrl(4), videoMediaMetadata: { width: 2160, height: 3840, durationMillis: '221000' } },
    { id: 'demo-image-2', name: '문서 스캔 원본.png', mimeType: 'image/png', size: '24576000', modifiedTime: '2026-08-11T03:20:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-2'], thumbnailLink: demoImageDataUrl(4), imageMediaMetadata: { width: 4032, height: 3024 } }
  ];
  state.treeCache = buildTreeIndexes(demoItems);
  computeAndRenderSubtree();
  showLibrary();
  el.libraryStatus.textContent = '데모 모드 — 실제 Google Drive 요청은 실행하지 않습니다.';
  updateConnectionBadge();
}

function demoImageDataUrl(seed = 0) {
  const palettes = [
    ['#0d1626', '#2376df', '#1c6a69', '#59a48b'],
    ['#21172d', '#bf8eda', '#8a4f73', '#df84a8'],
    ['#1d2024', '#de9255', '#6c7042', '#d0b768'],
    ['#102329', '#4fb9c9', '#246b78', '#72bc8f'],
    ['#231b18', '#e97366', '#8a503d', '#de9255']
  ];
  const [background, sun, back, front] = palettes[seed % palettes.length];
  const sunX = 1080 + (seed % 3) * 110;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="${background}"/><circle cx="${sunX}" cy="260" r="180" fill="${sun}" opacity=".78"/><path d="M0 740L430 410l280 230 230-180 660 540H0z" fill="${back}"/><path d="M0 810l500-300 350 270 250-160 500 380H0z" fill="${front}" opacity=".82"/><rect x="80" y="80" width="360" height="8" rx="4" fill="#fff" opacity=".7"/><rect x="80" y="110" width="220" height="5" rx="2" fill="#fff" opacity=".3"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
