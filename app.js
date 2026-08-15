'use strict';

const APP_VERSION = '1.0.5';
const CLIENT_ID_KEY = 'drive-original.oauth-client-id';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_SKEW_MS = 30_000;
const MOBILE_BLOB_LIMIT = 350 * 1024 * 1024;
const DESKTOP_BLOB_LIMIT = 2 * 1024 * 1024 * 1024;

const state = {
  clientId: localStorage.getItem(CLIENT_ID_KEY) || '',
  token: null,
  expiresAt: 0,
  tokenClient: null,
  files: [],
  nextPageToken: null,
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
  demo: new URLSearchParams(location.search).get('demo') === '1'
};

const el = {};
let toastTimer = null;
let feedbackTimer = null;
let updatePending = false;
let controlsHideTimer = null;
let isSeekingPointer = false;
let isSpeedMenuOpen = false;

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindElements();
  bindEvents();
  el.clientIdInput.value = state.clientId;
  el.settingsClientId.value = state.clientId;
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
  if (el.settingsAppVersion) el.settingsAppVersion.textContent = `v${APP_VERSION}`;
  updateConnectionBadge();
  await setupServiceWorker();

  if (state.demo) {
    startDemoMode();
  } else {
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
    'playerSheet', 'playerBackdrop', 'playerTitle', 'pipButton', 'fullscreenButton',
    'iconExpand', 'iconCompress', 'closePlayerButton', 'mediaStage', 'videoPlayer',
    'imageViewer', 'drivePreview', 'playerFeedback', 'stageCenterPlayBtn',
    'iconCenterPlay', 'iconCenterPause', 'customVideoControls', 'seekBarContainer',
    'seekBarBuffered', 'seekBarPlayed', 'seekBarThumb', 'seekBarTooltip',
    'ctrlPlayPause', 'ctrlIconPlay', 'ctrlIconPause', 'ctrlRewind', 'ctrlForward',
    'volumeControlGroup', 'ctrlMute', 'ctrlIconVolHigh', 'ctrlIconVolMuted',
    'ctrlVolumeSlider', 'ctrlTimeDisplay', 'ctrlCurrentTime', 'ctrlTotalTime',
    'speedMenuWrap', 'ctrlSpeedButton', 'ctrlSpeedText', 'speedDropdown',
    'ctrlPip', 'ctrlFullscreen', 'ctrlIconExpand', 'ctrlIconCompress',
    'mediaLoading', 'mediaLoadingText', 'mediaError', 'mediaErrorMessage',
    'retryMediaButton', 'openDriveButton', 'streamModeLabel', 'streamModeText',
    'qualityBadge', 'playbackQualityText', 'mediaResolution', 'streamModeDetail',
    'mediaFileSizeType', 'codecNote', 'settingsDialog', 'settingsAppVersion',
    'updateStatusText', 'checkUpdateButton', 'applyUpdateButton', 'forceReloadButton',
    'settingsClientId', 'saveSettingsButton', 'disconnectButton', 'setupHelpSection',
    'currentOrigin', 'copyOriginButton', 'appVersion', 'toast'
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
  el.refreshButton.addEventListener('click', () => loadFiles({ append: false }));
  el.searchInput.addEventListener('input', (event) => {
    state.query = event.target.value.trim().toLocaleLowerCase('ko');
    renderFiles();
  });
  el.sortSelect.addEventListener('change', (event) => {
    state.sort = event.target.value;
    renderFiles();
  });
  el.filterButtons.forEach((button) => button.addEventListener('click', () => {
    state.filter = button.dataset.filter;
    el.filterButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    renderFiles();
  }));
  el.loadMoreButton.addEventListener('click', () => loadFiles({ append: true }));
  el.closePlayerButton.addEventListener('click', closePlayer);
  el.playerBackdrop.addEventListener('click', closePlayer);
  el.fullscreenButton.addEventListener('click', toggleFullscreen);
  el.pipButton.addEventListener('click', togglePictureInPicture);
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
  el.imageViewer.addEventListener('load', onMediaReady);
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

    // Check if worker is already waiting
    if (registration.waiting) {
      notifyUpdateAvailable();
    }

    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          notifyUpdateAvailable();
        }
      });
    });

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
    showToast('스트리밍 모듈을 시작하지 못했습니다. 페이지를 새로고침하세요.');
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
    el.updateStatusText.textContent = `✨ ${verStr} 업데이트가 준비되었습니다. 지금 적용하세요.`;
  }
}

async function checkForAppUpdate({ manual = false } = {}) {
  if (manual && el.updateStatusText) {
    el.updateStatusText.textContent = '업데이트 서버 확인 중…';
    if (el.checkUpdateButton) el.checkUpdateButton.disabled = true;
  }

  let remoteVersion = null;
  let releaseInfo = null;

  try {
    // 1. Fetch remote version metadata directly from server (bypassing browser & SW caches)
    const versionUrl = new URL(`version.json?_t=${Date.now()}`, location.href).href;
    const res = await fetch(versionUrl, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate', 'Pragma': 'no-cache' }
    });

    if (res.ok) {
      releaseInfo = await res.json();
      remoteVersion = releaseInfo.version;
    } else {
      // Fallback: check sw.js
      const swRes = await fetch(`./sw.js?_t=${Date.now()}`, { cache: 'no-store' });
      if (swRes.ok) {
        const swText = await swRes.text();
        const match = swText.match(/VERSION\s*=\s*['"]([^'"]+)['"]/);
        if (match) remoteVersion = match[1];
      }
    }

    // 2. Trigger Service Worker registration update
    if ('serviceWorker' in navigator && state.serviceWorkerRegistration) {
      await state.serviceWorkerRegistration.update().catch(() => {});
    }

    const hasNewVersion = Boolean(remoteVersion && isNewerVersion(remoteVersion, APP_VERSION));
    const hasWaitingWorker = Boolean(state.serviceWorkerRegistration?.waiting);

    if (hasNewVersion || hasWaitingWorker) {
      const targetVer = remoteVersion || '1.0.5';
      notifyUpdateAvailable(targetVer, releaseInfo?.changeSummary);
      if (manual) {
        showToast(`새로운 버전(v${targetVer})이 준비되었습니다. [지금 업데이트]를 눌러 적용하세요.`);
      }
      return { hasUpdate: true, version: targetVer };
    }

    if (manual) {
      const now = new Date();
      const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
      if (el.updateStatusText) {
        el.updateStatusText.textContent = `✅ 현재 최신 버전(v${APP_VERSION})을 사용 중입니다. (${timeStr} 확인)`;
      }
      if (el.applyUpdateButton) el.applyUpdateButton.hidden = true;
      if (el.settingsUpdateDot) el.settingsUpdateDot.hidden = true;
      if (el.updateBanner) el.updateBanner.hidden = true;
      showToast(`현재 최신 버전(v${APP_VERSION})입니다.`);
    }
    return { hasUpdate: false, version: APP_VERSION };
  } catch (err) {
    console.error('Update check failed:', err);
    if (manual) {
      if (el.updateStatusText) el.updateStatusText.textContent = '업데이트 확인 중 오류가 발생했습니다. 네트워크를 확인하세요.';
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
  const reg = state.serviceWorkerRegistration;
  if (reg && reg.waiting) {
    reg.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (_) {}
    setTimeout(() => window.location.reload(), 300);
  }
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

async function handleTokenResponse(response) {
  setConnectBusy(false);
  if (!response || response.error || !response.access_token) {
    updateConnectionBadge();
    setClientIdError(response?.error_description || 'Google 인증이 완료되지 않았습니다.');
    return;
  }
  state.token = response.access_token;
  state.expiresAt = Date.now() + Math.max(60, Number(response.expires_in) || 3600) * 1000;
  clearClientIdError();
  sendTokenToWorker();
  updateConnectionBadge();

  if (state.retryAfterAuth && state.selected) {
    state.retryAfterAuth = false;
    openMediaSource(state.selected);
    return;
  }
  await loadFiles({ append: false });
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
  el.libraryStatus.textContent = append ? '다음 파일을 불러오는 중…' : 'Drive에서 원본 파일 목록을 불러오는 중…';
  el.refreshButton.disabled = true;
  el.loadMoreButton.disabled = true;

  const params = new URLSearchParams({
    pageSize: '100',
    orderBy: 'modifiedTime desc',
    q: "trashed = false and (mimeType contains 'video/' or mimeType contains 'image/')",
    spaces: 'drive',
    supportsAllDrives: 'true',
    includeItemsFromAllDrives: 'true',
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,thumbnailLink,hasThumbnail,webViewLink,capabilities(canDownload),videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
  });
  if (append && state.nextPageToken) params.set('pageToken', state.nextPageToken);

  try {
    const response = await driveFetch(`${DRIVE_API}/files?${params.toString()}`);
    const data = await response.json();
    const incoming = Array.isArray(data.files) ? data.files : [];
    state.files = append ? dedupeFiles([...state.files, ...incoming]) : incoming;
    state.nextPageToken = data.nextPageToken || null;
    renderFiles();
    el.libraryStatus.textContent = '';
  } catch (error) {
    console.error(error);
    el.libraryStatus.textContent = `파일 목록을 불러오지 못했습니다: ${humanizeDriveError(error)}`;
    if (error.status === 401) {
      clearToken(false);
      showSetup();
    }
  } finally {
    state.loadingFiles = false;
    el.refreshButton.disabled = false;
    el.loadMoreButton.disabled = false;
    el.loadMoreButton.hidden = !state.nextPageToken;
    updateLibrarySummary();
    updateConnectionBadge();
  }
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
  el.fileGrid.replaceChildren();
  const fragment = document.createDocumentFragment();
  files.forEach((file) => fragment.appendChild(createFileCard(file)));
  el.fileGrid.appendChild(fragment);
  el.emptyState.hidden = files.length > 0;
  updateLibrarySummary(files.length);
}

function filteredAndSortedFiles() {
  const filtered = state.files.filter((file) => {
    const isVideo = file.mimeType?.startsWith('video/');
    const typeMatch = state.filter === 'all' || (state.filter === 'video' && isVideo) || (state.filter === 'image' && !isVideo);
    const queryMatch = !state.query || String(file.name || '').toLocaleLowerCase('ko').includes(state.query);
    return typeMatch && queryMatch;
  });
  return filtered.sort((a, b) => {
    if (state.sort === 'name') return String(a.name).localeCompare(String(b.name), 'ko', { numeric: true });
    if (state.sort === 'size') return Number(b.size || 0) - Number(a.size || 0);
    return new Date(b.modifiedTime || 0) - new Date(a.modifiedTime || 0);
  });
}

function createFileCard(file) {
  const isVideo = file.mimeType?.startsWith('video/');
  const canDownload = file.capabilities?.canDownload !== false;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-card';
  button.disabled = !canDownload;
  button.setAttribute('aria-label', `${file.name}, ${isVideo ? '영상' : '이미지'}, 원본 열기`);

  const visual = document.createElement('span');
  visual.className = `file-visual ${isVideo ? 'video' : 'image'}`;
  if (file.thumbnailLink) {
    const thumbnail = document.createElement('img');
    thumbnail.className = 'file-thumbnail';
    thumbnail.alt = '';
    thumbnail.loading = 'lazy';
    thumbnail.decoding = 'async';
    thumbnail.referrerPolicy = 'no-referrer';
    thumbnail.addEventListener('load', () => {
      thumbnail.classList.add('loaded');
      visual.classList.add('has-thumbnail');
    });
    thumbnail.addEventListener('error', () => thumbnail.remove());
    thumbnail.src = file.thumbnailLink;
    visual.appendChild(thumbnail);
  }
  const kind = document.createElement('span');
  kind.className = 'file-kind';
  kind.textContent = isVideo ? 'VIDEO' : 'IMAGE';
  visual.appendChild(kind);
  if (isVideo && file.videoMediaMetadata?.durationMillis) {
    const duration = document.createElement('span');
    duration.className = 'file-duration';
    duration.textContent = formatDuration(Number(file.videoMediaMetadata.durationMillis) / 1000);
    visual.appendChild(duration);
  }

  const body = document.createElement('span');
  body.className = 'file-body';
  const name = document.createElement('span');
  name.className = 'file-name';
  name.textContent = file.name || '이름 없는 파일';
  const meta = document.createElement('span');
  meta.className = 'file-meta';
  const details = document.createElement('span');
  details.textContent = [resolutionText(file), formatBytes(file.size)].filter(Boolean).join(' / ') || friendlyMime(file.mimeType);
  const status = document.createElement('b');
  status.textContent = canDownload ? '원본' : '제한됨';
  meta.append(details, status);
  body.append(name, meta);
  button.append(visual, body);
  if (canDownload) button.addEventListener('click', () => openPlayer(file));
  return button;
}

function updateLibrarySummary(visibleCount) {
  const count = Number.isFinite(visibleCount) ? visibleCount : state.files.length;
  const totalText = `${state.files.length.toLocaleString('ko-KR')}개 불러옴`;
  el.librarySummary.textContent = count === state.files.length
    ? `${totalText} — 재생 시 원본 바이트 구간을 요청합니다.`
    : `${totalText} — 현재 ${count.toLocaleString('ko-KR')}개 표시`;
}

function openPlayer(file) {
  state.selected = file;
  document.body.style.overflow = 'hidden';
  el.playerSheet.hidden = false;
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
    showPlayerFeedback('▶ 재생');
  } else {
    el.videoPlayer.pause();
    showPlayerFeedback('⏸ 일시정지');
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
  showPlayerFeedback(deltaSeconds > 0 ? `⏩ +${deltaSeconds}초` : `⏪ ${deltaSeconds}초`);
  updateVideoProgress();
  resetControlsTimer();
}

function toggleMute() {
  if (!el.videoPlayer) return;
  el.videoPlayer.muted = !el.videoPlayer.muted;
  showPlayerFeedback(el.videoPlayer.muted ? '🔇 음소거' : `🔊 볼륨 ${Math.round(el.videoPlayer.volume * 100)}%`);
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
  showPlayerFeedback(`⚡ 재생 속도 ${speed}×`);
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

function showPlayerFeedback(text) {
  if (!el.playerFeedback) return;
  el.playerFeedback.textContent = text;
  el.playerFeedback.hidden = false;
  requestAnimationFrame(() => el.playerFeedback.classList.add('active'));
  clearTimeout(feedbackTimer);
  feedbackTimer = setTimeout(() => {
    el.playerFeedback.classList.remove('active');
    setTimeout(() => { if (!el.playerFeedback.classList.contains('active')) el.playerFeedback.hidden = true; }, 220);
  }, 800);
}

function handlePlayerKeyboard(event) {
  if (el.playerSheet.hidden) return;
  const isVideo = el.videoPlayer && !el.videoPlayer.hidden;
  const targetTag = event.target.tagName;
  if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;

  const key = event.key;
  const code = event.code;

  if (key === 'Escape') {
    if (isSpeedMenuOpen) {
      isSpeedMenuOpen = false;
      if (el.speedDropdown) el.speedDropdown.hidden = true;
      return;
    }
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      // Browser handles exiting fullscreen
    } else {
      closePlayer();
    }
    return;
  }

  if (key === 'f' || key === 'F') {
    event.preventDefault();
    toggleFullscreen();
    return;
  }

  if (isVideo) {
    if (key === ' ' || key === 'k' || key === 'K') {
      event.preventDefault();
      togglePlayPause();
      return;
    }

    if (key === 'm' || key === 'M') {
      event.preventDefault();
      toggleMute();
      return;
    }

    if (key === 'ArrowLeft' || key === 'j' || key === 'J') {
      event.preventDefault();
      const delta = (key === 'ArrowLeft') ? -5 : -10;
      seekRelative(delta);
      return;
    }

    if (key === 'ArrowRight' || key === 'l' || key === 'L') {
      event.preventDefault();
      const delta = (key === 'ArrowRight') ? 5 : 10;
      seekRelative(delta);
      return;
    }

    if (key === 'ArrowUp') {
      event.preventDefault();
      el.videoPlayer.muted = false;
      el.videoPlayer.volume = Math.min(1, +(el.videoPlayer.volume + 0.1).toFixed(2));
      showPlayerFeedback(`🔊 볼륨 ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (key === 'ArrowDown') {
      event.preventDefault();
      el.videoPlayer.volume = Math.max(0, +(el.videoPlayer.volume - 0.1).toFixed(2));
      showPlayerFeedback(`🔉 볼륨 ${Math.round(el.videoPlayer.volume * 100)}%`);
      updateVolumeUI();
      return;
    }

    if (code && code.startsWith('Digit') && !event.ctrlKey && !event.altKey && !event.metaKey) {
      const digit = Number(code.replace('Digit', ''));
      if (!isNaN(digit) && el.videoPlayer.duration) {
        event.preventDefault();
        el.videoPlayer.currentTime = (digit / 10) * el.videoPlayer.duration;
        showPlayerFeedback(`⏱ ${digit * 10}%`);
        updateVideoProgress();
      }
    }
  }
}

function openMediaSource(file) {
  resetMediaElements();
  const session = state.mediaSession;
  state.mediaAttempt = 'range';
  state.lastProxyError = null;
  updateQualityDisplay();
  showMediaLoading('원본 구간 스트림 준비 중');
  const isVideo = file.mimeType?.startsWith('video/');

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

function onMediaReady() {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
  updateQualityDisplay();
}

function setStreamMode(mode, label) {
  if (el.streamModeLabel) el.streamModeLabel.dataset.mode = mode;
  if (el.streamModeText) el.streamModeText.textContent = label;
}

function getResolutionCategory(width, height) {
  const w = Number(width) || 0;
  const h = Number(height) || 0;
  if (!w || !h) return '';
  const pixels = w * h;
  const maxDim = Math.max(w, h);
  const minDim = Math.min(w, h);
  if (maxDim >= 3840 || minDim >= 2160 || pixels >= 7_500_000) return '4K UHD';
  if (maxDim >= 2560 || minDim >= 1440 || pixels >= 3_500_000) return 'QHD 1440p';
  if (maxDim >= 1920 || minDim >= 1080 || pixels >= 1_900_000) return 'FHD 1080p';
  if (maxDim >= 1280 || minDim >= 720 || pixels >= 850_000) return 'HD 720p';
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
      el.qualityBadge.textContent = 'Drive 변환 화질';
    }
    if (el.playbackQualityText) el.playbackQualityText.textContent = 'Google 압축 변환본';
    if (el.streamModeDetail) el.streamModeDetail.textContent = 'Drive 미리보기 (iframe)';
    if (el.mediaResolution) {
      el.mediaResolution.textContent = metaW && metaH
        ? `가변 해상도 (원본: ${metaW}×${metaH} ${metaCat})`
        : 'Drive 가변 변환 해상도';
    }
  } else if (mode === 'blob' || mode === 'blob-loading') {
    setStreamMode('buffer', '원본 임시 버퍼');
    if (el.qualityBadge) {
      el.qualityBadge.dataset.quality = 'buffer';
      el.qualityBadge.textContent = effectiveCat ? `원본 ${effectiveCat}` : '100% 원본 화질';
    }
    if (el.playbackQualityText) el.playbackQualityText.textContent = '100% 무인코딩 원본';
    if (el.streamModeDetail) el.streamModeDetail.textContent = '메모리 버퍼 (Blob)';
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
      el.qualityBadge.textContent = effectiveCat ? `원본 ${effectiveCat}` : '100% 원본 화질';
    }
    if (el.playbackQualityText) el.playbackQualityText.textContent = '100% 무인코딩 원본';
    if (el.streamModeDetail) el.streamModeDetail.textContent = '구간 스트림 (Range)';
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
  const label = el.connectionBadge.querySelector('span');
  if (badgeState === 'busy') label.textContent = '연결 중';
  else if (!navigator.onLine) label.textContent = '오프라인';
  else if (badgeState === 'online') label.textContent = state.demo ? '데모 모드' : 'Drive 연결됨';
  else label.textContent = '연결 안 됨';
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
  state.files = [
    { id: 'demo-video-1', name: '서울 야간 산책 — 4K.mov', mimeType: 'video/quicktime', size: '4873258598', modifiedTime: '2026-08-15T08:30:00Z', capabilities: { canDownload: true }, videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '437000' } },
    { id: 'demo-image-1', name: '한강 원본 사진.heic', mimeType: 'image/heic', size: '12845032', modifiedTime: '2026-08-14T12:10:00Z', capabilities: { canDownload: true }, imageMediaMetadata: { width: 5712, height: 4284 } },
    { id: 'demo-video-2', name: '강의 녹화 03.mp4', mimeType: 'video/mp4', size: '2137483648', modifiedTime: '2026-08-13T05:40:00Z', capabilities: { canDownload: true }, videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '3842000' } },
    { id: 'demo-image-2', name: '문서 스캔 원본.png', mimeType: 'image/png', size: '24576000', modifiedTime: '2026-08-11T03:20:00Z', capabilities: { canDownload: true }, imageMediaMetadata: { width: 4032, height: 3024 } },
    { id: 'demo-video-3', name: '여행 클립 — HEVC.mp4', mimeType: 'video/mp4', size: '876523100', modifiedTime: '2026-08-08T16:00:00Z', capabilities: { canDownload: true }, videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '187000' } }
  ].map((file, index) => ({ ...file, thumbnailLink: demoImageDataUrl(index) }));
  state.nextPageToken = null;
  showLibrary();
  renderFiles();
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
