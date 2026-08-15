'use strict';

const APP_VERSION = '1.0.0';
const CLIENT_ID_KEY = 'drive-original.oauth-client-id';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const TOKEN_SKEW_MS = 30_000;

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
    'playerTitle', 'closePlayerButton', 'videoPlayer', 'imageViewer', 'mediaLoading',
    'mediaError', 'mediaErrorMessage', 'retryMediaButton', 'mediaResolution',
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
  el.videoPlayer.addEventListener('error', () => {
    if (!el.videoPlayer.getAttribute('src')) return;
    showMediaError(mediaPlaybackErrorMessage(el.videoPlayer.error));
  });
  el.imageViewer.addEventListener('load', onMediaReady);
  el.imageViewer.addEventListener('error', () => {
    if (!el.imageViewer.getAttribute('src')) return;
    showMediaError('원본 이미지를 열지 못했습니다. 로그인 만료, 다운로드 제한, 또는 Safari가 지원하지 않는 이미지 형식일 수 있습니다.');
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
    clearToken(false);
    if (state.selected) showMediaError('Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.');
    updateConnectionBadge();
    return;
  }
  if (data.type === 'MEDIA_PROXY_ERROR') {
    const message = data.status === 403
      ? 'Drive에서 원본 파일 전송을 거부했습니다. 파일의 다운로드 허용 설정과 계정 권한을 확인하세요.'
      : 'Drive 원본 스트림에 연결하지 못했습니다. 네트워크 상태를 확인하세요.';
    if (state.selected) showMediaError(message);
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
    fields: 'nextPageToken,files(id,name,mimeType,size,modifiedTime,resourceKey,capabilities(canDownload),videoMediaMetadata(width,height,durationMillis),imageMediaMetadata(width,height,rotation))'
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
  el.codecNote.textContent = '화질 변환 없이 Drive 원본 바이트를 전달합니다.';
  openMediaSource(file);
  requestAnimationFrame(() => el.closePlayerButton.focus());
}

function openMediaSource(file) {
  resetMediaElements();
  el.mediaLoading.hidden = false;
  el.mediaError.hidden = true;
  const isVideo = file.mimeType?.startsWith('video/');

  if (state.demo) {
    if (isVideo) {
      showMediaError('데모 화면에서는 영상 네트워크 요청을 실행하지 않습니다. 실제 연결에서는 Drive 원본 스트림이 여기에 표시됩니다.');
    } else {
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
    const support = el.videoPlayer.canPlayType(file.mimeType || '');
    if (!support && file.mimeType) {
      el.codecNote.textContent = '원본은 전달되지만 Safari가 이 영상 형식을 해독하지 못할 수 있습니다.';
    }
    el.videoPlayer.src = mediaUrl;
    el.videoPlayer.load();
  } else {
    el.imageViewer.hidden = false;
    el.imageViewer.alt = file.name || '원본 이미지';
    el.imageViewer.src = mediaUrl;
  }
}

function buildMediaUrl(file) {
  const base = new URL('.', location.href);
  const url = new URL(`__drive_media/${encodeURIComponent(file.id)}`, base);
  if (file.mimeType) url.searchParams.set('mime', file.mimeType);
  if (file.resourceKey) url.searchParams.set('resourceKey', file.resourceKey);
  return url.href;
}

function onMediaReady() {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = true;
}

function showMediaError(message) {
  el.mediaLoading.hidden = true;
  el.mediaError.hidden = false;
  el.mediaErrorMessage.textContent = message;
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

function resetMediaElements() {
  el.videoPlayer.pause();
  el.videoPlayer.removeAttribute('src');
  el.videoPlayer.load();
  el.videoPlayer.hidden = true;
  el.imageViewer.removeAttribute('src');
  el.imageViewer.alt = '';
  el.imageViewer.hidden = true;
  el.mediaError.hidden = true;
  el.mediaLoading.hidden = false;
}

function mediaPlaybackErrorMessage(error) {
  if (!navigator.onLine) return '네트워크가 오프라인입니다. 연결 후 다시 시도하세요.';
  if (!hasUsableToken()) return 'Google 인증 시간이 만료됐습니다. 다시 시도를 누르면 연결을 갱신합니다.';
  if (error?.code === MediaError.MEDIA_ERR_DECODE || error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return '원본 파일은 전송됐지만 iPhone Safari가 이 컨테이너 또는 코덱 조합을 지원하지 않습니다. MP4의 H.264, HEVC 영상과 AAC 오디오 조합이 가장 안정적입니다.';
  }
  return '원본 스트림을 재생하지 못했습니다. 파일의 다운로드 허용 설정과 네트워크 상태를 확인하세요.';
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
  ];
  state.nextPageToken = null;
  showLibrary();
  renderFiles();
  el.libraryStatus.textContent = '데모 모드 — 실제 Google Drive 요청은 실행하지 않습니다.';
  updateConnectionBadge();
}

function demoImageDataUrl() {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000"><rect width="1600" height="1000" fill="#0d1626"/><circle cx="1180" cy="260" r="180" fill="#2376df" opacity=".7"/><path d="M0 740L430 410l280 230 230-180 660 540H0z" fill="#1c6a69"/><path d="M0 810l500-300 350 270 250-160 500 380H0z" fill="#59a48b" opacity=".75"/><rect x="80" y="80" width="360" height="8" rx="4" fill="#fff" opacity=".75"/><rect x="80" y="110" width="220" height="5" rx="2" fill="#fff" opacity=".35"/></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
