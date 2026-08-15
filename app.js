'use strict';

const APP_VERSION = '1.0.1';
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

window.addEventListener('DOMContentLoaded', init);

async function init() {
  bindElements();
  bindEvents();
  el.clientIdInput.value = state.clientId;
  el.settingsClientId.value = state.clientId;
  el.currentOrigin.textContent = location.origin;
  el.appVersion.textContent = `v${APP_VERSION}`;
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
    'brandButton', 'connectionBadge', 'settingsButton', 'setupView', 'libraryView',
    'clientIdInput', 'clientIdHint', 'pasteClientId', 'connectButton', 'openSetupHelp',
    'librarySummary', 'refreshButton', 'searchInput', 'sortSelect', 'libraryStatus',
    'fileGrid', 'emptyState', 'loadMoreButton', 'playerSheet', 'playerBackdrop',
    'playerTitle', 'closePlayerButton', 'videoPlayer', 'imageViewer', 'drivePreview',
    'mediaLoading', 'mediaLoadingText', 'mediaError', 'mediaErrorMessage',
    'retryMediaButton', 'openDriveButton', 'streamModeLabel', 'mediaResolution',
    'mediaSize', 'mediaType', 'codecNote', 'settingsDialog', 'settingsClientId',
    'saveSettingsButton', 'disconnectButton', 'setupHelpSection', 'currentOrigin',
    'copyOriginButton', 'appVersion', 'toast'
  ];
  ids.forEach((id) => { el[id] = document.getElementById(id); });
  el.filterButtons = [...document.querySelectorAll('[data-filter]')];
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && !el.playerSheet.hidden) closePlayer();
  });
  el.retryMediaButton.addEventListener('click', retryMedia);
  el.openDriveButton.addEventListener('click', openSelectedInDrive);
  el.saveSettingsButton.addEventListener('click', saveSettings);
  el.disconnectButton.addEventListener('click', disconnect);
  el.copyOriginButton.addEventListener('click', copyOrigin);
  window.addEventListener('online', updateConnectionBadge);
  window.addEventListener('offline', updateConnectionBadge);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') sendTokenToWorker();
  });

  el.videoPlayer.addEventListener('loadedmetadata', onMediaReady);
  el.videoPlayer.addEventListener('canplay', onMediaReady, { once: false });
  el.videoPlayer.addEventListener('error', () => handleMediaElementError('video'));
  el.imageViewer.addEventListener('load', onMediaReady);
  el.imageViewer.addEventListener('error', () => handleMediaElementError('image'));
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
    navigator.serviceWorker.addEventListener('controllerchange', sendTokenToWorker);
    navigator.serviceWorker.addEventListener('message', handleWorkerMessage);
    sendTokenToWorker();
    setInterval(sendTokenToWorker, 20_000);
  } catch (error) {
    console.error('Service worker registration failed', error);
    showToast('스트리밍 모듈을 시작하지 못했습니다. 페이지를 새로고침하세요.');
  }
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
  el.mediaResolution.textContent = resolutionText(file) || '정보 없음';
  el.mediaSize.textContent = formatBytes(file.size) || '정보 없음';
  el.mediaType.textContent = friendlyMime(file.mimeType);
  el.codecNote.textContent = '먼저 원본 구간 스트림을 시도하고, 실패하면 메모리 임시 버퍼로 자동 전환합니다.';
  openMediaSource(file);
  requestAnimationFrame(() => el.closePlayerButton.focus());
}

function openMediaSource(file) {
  resetMediaElements();
  const session = state.mediaSession;
  state.mediaAttempt = 'range';
  state.lastProxyError = null;
  setStreamMode('range', '원본 스트림');
  showMediaLoading('원본 구간 스트림 준비 중');
  const isVideo = file.mimeType?.startsWith('video/');

  if (state.demo) {
    if (isVideo) {
      showMediaError('데모 화면에서는 실제 Drive 영상을 요청하지 않습니다.', { showDrive: false });
    } else {
      state.mediaAttempt = 'blob';
      setStreamMode('buffer', '원본 임시 버퍼');
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
  setStreamMode('buffer', '원본 임시 버퍼');
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
    el.codecNote.textContent = '구간 스트림 대신 원본 전체를 메모리에 임시 저장했습니다. 플레이어를 닫으면 즉시 해제됩니다.';

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
  setStreamMode('drive', 'Drive 호환 재생');
  showMediaLoading('Drive 호환 재생기로 전환 중');
  el.drivePreview.hidden = false;
  el.drivePreview.src = buildDrivePreviewUrl(file);
  el.codecNote.textContent = `${reason} 이 모드는 Google의 변환본을 사용하므로 화질이 원본보다 낮을 수 있습니다.`;
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
}

function setStreamMode(mode, label) {
  el.streamModeLabel.dataset.mode = mode;
  const text = el.streamModeLabel.querySelector('span');
  if (text) text.textContent = label;
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
