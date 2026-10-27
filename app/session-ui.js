'use strict';

// Settings, sign-out, setup/library views, GIF thumbnails, toasts, formatting and demo mode.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

function isMobileDevice() {
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 0 && matchMedia('(pointer: coarse)').matches)
    || matchMedia('(max-width: 600px)').matches;
}

function openSettings(scrollToHelp) {
  const content = el.settingsDialog.querySelector('.dialog-content');
  if (scrollToHelp && el.settingsAdvanced) el.settingsAdvanced.open = true;
  if (!el.settingsDialog.open) el.settingsDialog.showModal();
  if (content) content.scrollTop = 0;
  if (scrollToHelp) requestAnimationFrame(() => el.setupHelpSection.scrollIntoView({ behavior: 'instant', block: 'start' }));
}

async function postAuthAction(path, body = {}) {
  if (!navigator.onLine) return { ok: false, payload: null };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AUTH_MUTATION_TIMEOUT_MS);
  try {
    const response = await fetch(new URL(path, location.origin), {
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
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const payload = await readAuthJson(response);
    return { ok: response.ok && Boolean(payload) && !payload.error, payload };
  } catch (_) {
    return { ok: false, payload: null };
  } finally {
    clearTimeout(timeout);
  }
}

// Shared local teardown once the server confirmed logout or disconnect.
function returnToSetupWithoutAccount() {
  clearStandaloneAuthAttempt();
  clearToken(true, { preserveAccount: false });
  invalidateDriveSessionData();
  state.selected = null;
  closePlayer();
  if (el.settingsDialog.open) el.settingsDialog.close();
  showSetup();
}

async function logout() {
  if (el.logoutButton) el.logoutButton.disabled = true;
  const result = await postAuthAction(AUTH_LOGOUT_PATH);
  if (el.logoutButton) el.logoutButton.disabled = false;
  if (!result.ok || result.payload?.loggedOut !== true) {
    showToast('로그아웃하지 못했습니다. 연결 상태를 확인해 주세요.');
    return;
  }
  returnToSetupWithoutAccount();
  showToast('이 브라우저 세션에서 로그아웃했습니다.');
}

async function disconnect() {
  if (!state.authAccountKey) {
    showToast('연결된 Google 계정이 없습니다.');
    return;
  }
  if (!window.confirm('모든 로그인 세션과 서버에 보관된 계정 인증 정보를 삭제하고 Google 연결을 해제할까요?')) return;
  el.disconnectButton.disabled = true;
  const result = await postAuthAction(AUTH_DISCONNECT_PATH, { expectedAccount: state.authAccountKey });
  el.disconnectButton.disabled = false;
  if (!result.ok || result.payload?.disconnected !== true) {
    showToast('연결을 해제하지 못했습니다. 연결 상태를 확인해 주세요.');
    return;
  }
  returnToSetupWithoutAccount();
  if (result.payload.revocation === 'confirmed') {
    showToast('앱 세션과 Google Drive 연결을 해제했습니다.');
  } else {
    setAuthError('앱 세션은 삭제했지만 Google 권한 폐기는 확인되지 않았습니다. Google 계정의 연결된 앱에서 Drive Original 권한을 확인해 주세요.');
    showToast('앱 세션은 삭제됐지만 Google 권한 폐기는 확인되지 않았습니다.');
  }
}

function clearToken(notifyWorker, { preserveAccount = true } = {}) {
  const clearedAccount = state.authAccountKey;
  const clearedRevision = state.tokenRevision;
  const clearedAccountGeneration = state.driveSessionGeneration;
  stopAccountStateRefresh();
  state.authGeneration += 1;
  state.accountStateAbortController?.abort();
  state.accountStateAbortController = null;
  credentialRequestAbortController?.abort();
  credentialRequestAbortController = null;
  credentialRequestPromise = null;
  credentialRequestGeneration = -1;
  credentialRequestOutcome = null;
  sessionCredentialMarker = null;
  state.token = null;
  state.authCapabilities = null;
  state.expiresAt = 0;
  if (!preserveAccount) {
    state.authAccountKey = null;
    state.tokenRevision = 0;
    state.authStatus = 'anonymous';
  } else if (state.authStatus === 'online') {
    state.authStatus = 'reconnect-required';
  }
  if (tokenRenewalTimer) {
    clearTimeout(tokenRenewalTimer);
    tokenRenewalTimer = null;
  }
  try {
    localStorage.removeItem(LEGACY_TOKEN_STORAGE_KEY);
  } catch (_) {}
  if (notifyWorker && navigator.serviceWorker) {
    const message = {
      type: 'CLEAR_TOKEN',
      credentialProtocol: AUTH_PROTOCOL,
      account: clearedAccount,
      revision: clearedRevision,
      accountGeneration: clearedAccountGeneration
    };
    navigator.serviceWorker.controller?.postMessage(message);
    const registration = state.serviceWorkerRegistration;
    [registration?.active, registration?.waiting, registration?.installing].forEach((worker) => worker?.postMessage(message));
  }
}

function invalidateDriveSessionData() {
  completedMediaSeekPresentation = null;
  stopAccountStateRefresh();
  state.accountStateRefreshFailures = 0;
  state.accountStateRefreshNotBefore = 0;
  state.accountStateRefreshBlocked = false;
  resetLibraryNavigation();
  state.previousAccountId = state.accountId || state.previousAccountId;
  state.accountIdentityPending = true;
  state.driveSessionGeneration += 1;
  state.accountStateAbortController?.abort();
  state.accountStateAbortController = null;
  state.accountStateReadCache.clear();
  state.folderIndexAbortController?.abort();
  state.treeAbort?.abort();
  resetListingSession();
  state.folderIndex = null;
  state.folderIndexPromise = null;
  state.moveFolderRows = [];
  state.rootFolderId = null;
  state.treeCache = null;
  state.treeCachePromise = null;
  clearTimeout(state.accountStateSyncTimer);
  state.accountStateSyncTimer = null;
  clearTimeout(state.accountStateSyncRetryTimer);
  state.accountStateSyncRetryTimer = null;
  state.accountId = null;
  state.accountMediaState = createEmptyAccountMediaState();
  state.accountStateFileId = null;
  state.accountStateLoaded = false;
  state.accountStateLoadingPromise = null;
  state.accountStateSyncPromise = null;
  state.accountStateLastSyncAt = 0;
  state.accountStateSyncRetryCount = 0;
  state.accountStateSyncError = null;
  state.accountLocalStorageError = false;
  cancelFavoriteLoad();
  state.favoriteFiles = [];
}

async function copyOrigin() {
  try {
    await navigator.clipboard.writeText(location.origin);
    showToast('현재 원본 주소를 복사했습니다.');
  } catch (_) {
    showToast('복사하지 못했습니다. 주소를 직접 선택해 복사하세요.');
  }
}

// Selects the whole name first, so a blocked clipboard still leaves it ready
// for the system copy menu. The modal dialog sits above toasts, so the button
// reports the result itself.
// Full-name dialog (D118) that also renames the file in place (D121).
function openFileNameDialog(file, { edit = false } = {}) {
  if (!file?.id || !el.fileNameDialog) return;
  state.fileNameDialogFile = file;
  el.fileNameText.textContent = file.name || '이름 없는 파일';
  if (el.fileNameRenameButton) el.fileNameRenameButton.hidden = !canRenameFile(file);
  setFileNameEditing(false);
  if (!el.fileNameDialog.open) el.fileNameDialog.showModal();
  if (edit) startFileNameEdit();
}

function canRenameFile(file) {
  return Boolean(file?.id) && (state.demo || !state.accountIdentityPending)
    && file.capabilities?.canRename !== false && !state.hiddenActionFileIds.has(file.id);
}

function requestRenameFile() {
  const file = state.selected;
  if (!canRenameFile(file)) return;
  openFileNameDialog(file, { edit: true });
}

function setFileNameEditing(editing) {
  if (!el.fileNameDialog || !el.fileNameEdit) return;
  el.fileNameDialog.classList.toggle('editing', editing);
  el.fileNameView.hidden = editing;
  el.fileNameEdit.hidden = !editing;
  if (el.fileNameDialogTitle) el.fileNameDialogTitle.textContent = editing ? '이름 바꾸기' : '파일명';
}

function startFileNameEdit() {
  const file = state.fileNameDialogFile;
  if (!canRenameFile(file)) return;
  const name = file.name || '';
  setFileNameEditing(true);
  el.fileNameInput.value = name;
  updateFileNameHint();
  el.fileNameInput.focus({ preventScroll: true });
  // Select only the base name so typing keeps the extension.
  const dot = name.lastIndexOf('.');
  el.fileNameInput.setSelectionRange(0, dot > 0 ? dot : name.length);
}

function cancelFileNameEdit() {
  setFileNameEditing(false);
  el.fileNameRenameButton?.focus({ preventScroll: true });
}

function fileNameExtension(name) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

function updateFileNameHint() {
  const original = state.fileNameDialogFile?.name || '';
  const name = normalizeRenameInput(el.fileNameInput.value);
  el.fileNameHint.textContent = !name ? '파일명을 입력하세요.'
    : fileNameExtension(name) !== fileNameExtension(original) ? '확장자가 바뀝니다. 다른 앱에서 파일을 다르게 열 수 있습니다.' : '';
  el.fileNameSaveButton.disabled = !name;
}

function saveFileNameEdit() {
  const file = state.fileNameDialogFile;
  const name = normalizeRenameInput(el.fileNameInput.value);
  if (!file || !name) {
    updateFileNameHint();
    return;
  }
  if (el.fileNameDialog.open) el.fileNameDialog.close();
  performRenameFile(file, name);
}

function copyFileNameText() {
  const text = el.fileNameText.textContent || '';
  const selection = window.getSelection?.();
  if (selection && document.createRange) {
    const range = document.createRange();
    range.selectNodeContents(el.fileNameText);
    selection.removeAllRanges();
    selection.addRange(range);
  }
  let copied = false;
  try { copied = document.execCommand?.('copy') === true; } catch (_) {}
  reportFileNameCopy(copied);
  if (!copied) navigator.clipboard?.writeText?.(text).then(() => reportFileNameCopy(true), () => {});
}

function reportFileNameCopy(copied) {
  const button = el.fileNameCopyButton;
  if (!button) return;
  button.textContent = copied ? '복사됨' : '선택됨 · 직접 복사하세요';
  clearTimeout(button.resetTimer);
  button.resetTimer = setTimeout(() => { button.textContent = '복사'; }, 1600);
}

// Custom dropdown (D119) over a native <select>. The hidden select stays the
// value owner, so existing `select.value` writes, option rebuilds and change
// listeners keep working; the button and list only mirror and drive it.
function enhanceSelect(select) {
  if (!select || select.dataset.customSelect || typeof HTMLSelectElement === 'undefined') return;
  select.dataset.customSelect = 'true';
  const wrap = document.createElement('div');
  wrap.className = 'custom-select';
  select.before(wrap);
  wrap.append(select);
  select.classList.add('custom-select-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const baseId = select.id || `select-${Math.random().toString(36).slice(2)}`;
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'custom-select-button';
  button.id = `${baseId}Button`;
  button.setAttribute('aria-haspopup', 'listbox');
  button.setAttribute('aria-expanded', 'false');
  if (select.getAttribute('aria-label')) button.setAttribute('aria-label', select.getAttribute('aria-label'));
  if (select.getAttribute('aria-describedby')) button.setAttribute('aria-describedby', select.getAttribute('aria-describedby'));
  document.querySelectorAll(`label[for="${baseId}"]`).forEach((label) => { label.htmlFor = button.id; });
  const value = document.createElement('span');
  value.className = 'custom-select-value';
  button.append(value);
  button.insertAdjacentHTML('beforeend', '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>');
  const list = document.createElement('div');
  list.className = 'custom-select-list';
  list.id = `${baseId}List`;
  list.setAttribute('role', 'listbox');
  list.hidden = true;
  // The top layer keeps the list above dialogs and outside clipping parents.
  const usesPopover = typeof list.showPopover === 'function';
  if (usesPopover) list.setAttribute('popover', 'manual');
  button.setAttribute('aria-controls', list.id);
  wrap.append(button, list);

  let open = false;
  let active = -1;
  let typed = '';
  let typedTimer = null;
  const options = () => [...select.options];
  const usable = (index) => {
    const option = select.options[index];
    return Boolean(option) && !option.disabled && !option.hidden;
  };

  const sync = () => {
    const selected = select.options[select.selectedIndex];
    value.textContent = selected ? selected.textContent : '';
    const name = select.getAttribute('aria-label');
    if (name) button.setAttribute('aria-label', `${name}: ${value.textContent}`);
    button.disabled = select.disabled;
    if (select.disabled && open) close();
    if (open) renderList();
  };

  const renderList = () => {
    list.replaceChildren(...options().map((option, index) => {
      const item = document.createElement('div');
      item.className = 'custom-select-option';
      item.id = `${list.id}-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === select.selectedIndex));
      if (!usable(index)) item.setAttribute('aria-disabled', 'true');
      item.classList.toggle('active', index === active);
      item.textContent = option.textContent;
      item.hidden = option.hidden;
      item.addEventListener('pointerdown', (event) => event.preventDefault());
      item.addEventListener('click', () => choose(index));
      return item;
    }));
    if (active >= 0) {
      button.setAttribute('aria-activedescendant', `${list.id}-${active}`);
      list.children[active]?.scrollIntoView?.({ block: 'nearest' });
    } else button.removeAttribute('aria-activedescendant');
  };

  const place = () => {
    const rect = button.getBoundingClientRect();
    list.style.minWidth = `${Math.round(rect.width)}px`;
    list.style.maxHeight = '';
    const desired = Math.min(list.scrollHeight, 480);
    const below = window.innerHeight - rect.bottom - 12;
    const above = rect.top - 12;
    const up = below < desired && above > below;
    const room = Math.max(120, Math.min(480, up ? above : below));
    list.style.maxHeight = `${room}px`;
    const height = Math.min(desired, room);
    const width = list.offsetWidth || rect.width;
    list.style.left = `${Math.round(Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)))}px`;
    list.style.top = `${Math.round(up ? rect.top - 6 - height : rect.bottom + 6)}px`;
    list.classList.toggle('drop-up', up);
  };

  const outside = (event) => { if (!wrap.contains(event.target)) close(); };
  const reposition = (event) => { if (!list.contains(event.target)) close(); };

  function openList() {
    if (open || select.disabled) return;
    open = true;
    active = select.selectedIndex;
    button.setAttribute('aria-expanded', 'true');
    wrap.classList.add('open');
    list.hidden = false;
    if (usesPopover) { try { list.showPopover(); } catch (_) {} }
    renderList();
    place();
    document.addEventListener('pointerdown', outside, true);
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', close);
  }

  function close() {
    if (!open) return;
    open = false;
    button.setAttribute('aria-expanded', 'false');
    button.removeAttribute('aria-activedescendant');
    wrap.classList.remove('open');
    if (usesPopover) { try { list.hidePopover(); } catch (_) {} }
    list.hidden = true;
    document.removeEventListener('pointerdown', outside, true);
    window.removeEventListener('scroll', reposition, true);
    window.removeEventListener('resize', close);
  }

  function choose(index) {
    if (!usable(index)) return;
    const changed = select.selectedIndex !== index;
    // Close first: a re-render while open would detach the clicked option and
    // outside-click handlers (the library options popover) would misread it.
    close();
    select.selectedIndex = index;
    button.focus();
    if (changed) select.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const step = (from, delta) => {
    const count = select.options.length;
    for (let index = from + delta; index >= 0 && index < count; index += delta) if (usable(index)) return index;
    return from;
  };

  button.addEventListener('click', () => (open ? close() : openList()));
  button.addEventListener('keydown', (event) => {
    const key = event.key;
    if (!open) {
      if (key === 'ArrowDown' || key === 'ArrowUp' || key === 'Enter' || key === ' ') {
        event.preventDefault();
        openList();
      }
      return;
    }
    if (key === 'Escape' || key === 'Tab') {
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); }
      close();
      return;
    }
    if (key === 'Enter' || key === ' ') { event.preventDefault(); choose(active); return; }
    let next = active;
    if (key === 'ArrowDown') next = step(active, 1);
    else if (key === 'ArrowUp') next = step(active, -1);
    else if (key === 'Home') next = step(-1, 1);
    else if (key === 'End') next = step(select.options.length, -1);
    else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      clearTimeout(typedTimer);
      typed += key.toLowerCase();
      typedTimer = setTimeout(() => { typed = ''; }, 600);
      const match = options().findIndex((option, index) => usable(index) && option.textContent.trim().toLowerCase().startsWith(typed));
      if (match >= 0) next = match;
    } else return;
    event.preventDefault();
    active = next;
    renderList();
  });
  button.addEventListener('blur', () => setTimeout(() => {
    if (open && !wrap.contains(document.activeElement)) close();
  }, 0));

  // Programmatic value writes and option rebuilds reach the mirror too.
  for (const property of ['value', 'selectedIndex']) {
    const native = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, property);
    Object.defineProperty(select, property, {
      configurable: true,
      get() { return native.get.call(this); },
      set(next) { native.set.call(this, next); sync(); }
    });
  }
  new MutationObserver(sync).observe(select, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'selected', 'hidden', 'label'] });
  select.addEventListener('change', sync);
  sync();
}

function clearRejectedToken(error) {
  if (error?.status !== 401 || error.rejectedTokenRevision == null) return;
  if (error.rejectedTokenRevision === (state.tokenRevision || 0)
    && error.rejectedAccountGeneration === state.driveSessionGeneration) clearToken(true);
}

function showSetup() {
  el.setupView.hidden = false;
  el.libraryView.hidden = true;
  updateConnectionBadge();
}

function showReconnectState() {
  if (!state.accountId || state.accountIdentityPending) { showSetup(); return; }
  updateConnectionBadge();
  if (hasUsableToken()) return;
  const button = document.getElementById?.('reconnectButton');
  if (button) button.hidden = false;
}

function showLibrary() {
  el.setupView.hidden = true;
  el.libraryView.hidden = false;
}

function setConnectBusy(busy, busyLabel = 'Google 연결 대기 중…') {
  el.connectButton.disabled = busy;
  const reconnect = document.getElementById?.('reconnectButton');
  if (reconnect) reconnect.disabled = busy;
  const label = el.connectButton.querySelector('span');
  if (label) label.textContent = busy ? busyLabel : 'Google Drive에 연결';
}

function setBootstrapAuthPending(pending) {
  const active = Boolean(pending);
  setConnectBusy(active, '기존 Drive 연결 확인 중…');
  el.setupView?.setAttribute?.('aria-busy', String(active));
  updateConnectionBadge(active ? 'busy' : undefined);
}

function updateConnectionBadge(forcedState) {
  const reconnect = document.getElementById?.('reconnectButton');
  if (reconnect) {
    const partial = state.authCapabilities && ['driveRead', 'driveWrite', 'appData'].some(feature => !hasAuthCapability(feature));
    reconnect.hidden = Boolean(state.demo || (hasUsableToken() && !partial) || (!state.accountId && !partial));
  }
  const badgeState = forcedState || (!navigator.onLine ? 'offline' : hasUsableToken() || state.demo ? 'online' : 'offline');
  el.connectionBadge.dataset.state = badgeState;
  const label = el.connectionBadge.querySelector('.badge-text') || el.connectionBadge.querySelector('span:last-child');
  if (label) {
    if (badgeState === 'busy') label.textContent = '연결 중…';
    else if (!navigator.onLine) label.textContent = '오프라인';
    else if (badgeState === 'online') label.textContent = state.demo ? '데모 모드' : 'Drive 연결됨';
    else if (state.authStatus === 'reconnect-required') label.textContent = '재연결 필요';
    else if (state.authStatus === 'auth-unavailable') label.textContent = '인증 일시 중단';
    else label.textContent = '연결 안 됨';
  }
  // A healthy or still-checking connection needs no chrome; only states the user must act on show.
  el.connectionBadge.hidden = state.demo || badgeState === 'online' || badgeState === 'busy'
    || (navigator.onLine && !['reconnect-required', 'auth-unavailable'].includes(state.authStatus));
}

function hasUsableToken() {
  return Boolean(state.token && Date.now() < state.expiresAt - TOKEN_SKEW_MS);
}

function setAuthError(message) {
  el.authHint.textContent = message;
  el.authHint.classList.add('error');
}

function getStaticGifThumbnailObserver() {
  if (typeof IntersectionObserver !== 'function') return null;
  if (gifThumbnailObserver) return gifThumbnailObserver;
  gifThumbnailObserver = new IntersectionObserver((observations) => {
    observations.forEach((observation) => {
      const entry = gifThumbnailEntries.get(observation.target);
      if (!entry || entry.disposed) return;
      entry.nearby = observation.isIntersecting;
      if (entry.nearby) queueStaticGifThumbnailEntry(entry);
      else releaseStaticGifThumbnail(entry);
    });
  }, {
    root: null,
    rootMargin: '600px 0px',
    threshold: 0
  });
  return gifThumbnailObserver;
}

function registerStaticGifThumbnail(file, canvas, visualContainer, placeholder, eager = false) {
  if (!file?.thumbnailLink || !canvas) return;
  const entry = {
    file,
    canvas,
    visualContainer,
    placeholder,
    generation: thumbnailGeneration,
    nearby: false,
    queued: false,
    loading: false,
    loaded: false,
    disposed: false
  };
  gifThumbnailEntries.set(canvas, entry);
  const observer = getStaticGifThumbnailObserver();
  if (observer) {
    observer.observe(canvas);
  } else if (eager) {
    entry.nearby = true;
    queueStaticGifThumbnailEntry(entry);
  }
}

function queueStaticGifThumbnail(file, canvas, visualContainer, placeholder) {
  if (!file?.thumbnailLink || !canvas) return;
  let entry = gifThumbnailEntries.get(canvas);
  if (!entry) {
    entry = {
      file,
      canvas,
      visualContainer,
      placeholder,
      generation: thumbnailGeneration,
      nearby: true,
      queued: false,
      loading: false,
      loaded: false,
      disposed: false
    };
    gifThumbnailEntries.set(canvas, entry);
  } else {
    entry.nearby = true;
  }
  queueStaticGifThumbnailEntry(entry);
}

function queueStaticGifThumbnailEntry(entry) {
  if (
    typeof Image !== 'function' || !entry || entry.disposed || entry.loaded
    || entry.loading || entry.queued || !entry.nearby
    || entry.generation !== thumbnailGeneration
    || entry.canvas?.isConnected === false || !entry.file?.thumbnailLink
  ) return;
  entry.queued = true;
  gifThumbnailQueue.push(entry);
  setTimeout(processGifThumbnailQueue, 0);
}

function releaseStaticGifThumbnail(entry, { dispose = false } = {}) {
  if (!entry || entry.disposed) return;
  entry.nearby = false;
  entry.queued = false;
  if (entry.loading) {
    [...activeGifThumbnailJobs]
      .filter((job) => job.entry === entry)
      .forEach((job) => job.cancel(false));
  }
  if (entry.loaded || dispose) {
    entry.canvas.width = 1;
    entry.canvas.height = 1;
    entry.canvas.classList?.remove?.('loaded');
    entry.visualContainer?.classList?.remove?.('has-thumbnail');
    if (entry.placeholder) entry.placeholder.hidden = false;
    entry.loaded = false;
  }
  if (dispose) {
    entry.disposed = true;
    gifThumbnailObserver?.unobserve(entry.canvas);
  }
}

function pruneStaticGifThumbnailEntries() {
  gifThumbnailEntries.forEach((entry, canvas) => {
    if (canvas?.isConnected !== false) return;
    releaseStaticGifThumbnail(entry, { dispose: true });
    gifThumbnailEntries.delete(canvas);
  });
}

function processGifThumbnailQueue() {
  if (playerMediaPriorityActive) return;
  while (activeGifThumbnailLoads < MAX_CONCURRENT_EXTRACTIONS && gifThumbnailQueue.length) {
    const entry = gifThumbnailQueue.shift();
    entry.queued = false;
    if (
      entry.disposed || !entry.nearby || entry.loaded || entry.loading
      || entry.generation !== thumbnailGeneration
      || entry.canvas?.isConnected === false || !entry.file?.thumbnailLink
    ) continue;

    const image = new Image();
    let settled = false;
    let job = null;
    entry.loading = true;
    activeGifThumbnailLoads += 1;

    const finish = (loaded, defer = false) => {
      if (settled) return;
      settled = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute?.('src');
      entry.loading = false;
      activeGifThumbnailJobs.delete(job);
      activeGifThumbnailLoads = Math.max(0, activeGifThumbnailLoads - 1);
      if (
        defer && !entry.disposed && entry.nearby
        && entry.generation === thumbnailGeneration
        && entry.canvas?.isConnected !== false
      ) {
        entry.queued = true;
        gifThumbnailQueue.unshift(entry);
      } else if (
        loaded && !entry.disposed && entry.nearby
        && entry.generation === thumbnailGeneration
        && entry.canvas?.isConnected !== false
      ) {
        entry.loaded = true;
        entry.canvas.classList.add('loaded');
        entry.visualContainer?.classList.add('has-thumbnail');
        if (entry.placeholder) entry.placeholder.hidden = true;
      }
      setTimeout(processGifThumbnailQueue, 0);
    };

    job = { entry, cancel: (defer = false) => finish(false, defer) };
    activeGifThumbnailJobs.add(job);
    image.decoding = 'async';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => {
      try {
        if (!entry.nearby || entry.disposed || entry.canvas?.isConnected === false) {
          finish(false);
          return;
        }
        const sourceWidth = Number(image.naturalWidth) || 0;
        const sourceHeight = Number(image.naturalHeight) || 0;
        const context = entry.canvas.getContext?.('2d', { alpha: false });
        if (!context || !sourceWidth || !sourceHeight) {
          finish(false);
          return;
        }
        entry.canvas.width = GIF_THUMBNAIL_SIZE;
        entry.canvas.height = GIF_THUMBNAIL_SIZE;
        const cropSize = Math.min(sourceWidth, sourceHeight);
        const sourceX = Math.max(0, (sourceWidth - cropSize) / 2);
        const sourceY = Math.max(0, (sourceHeight - cropSize) / 2);
        context.drawImage(
          image,
          sourceX,
          sourceY,
          cropSize,
          cropSize,
          0,
          0,
          GIF_THUMBNAIL_SIZE,
          GIF_THUMBNAIL_SIZE
        );
        finish(true);
      } catch (error) {
        reportAppFailure('gif-thumbnail-capture', error, 'warn');
        entry.canvas.width = 1;
        entry.canvas.height = 1;
        finish(false);
      }
    };
    image.onerror = () => finish(false);
    image.src = entry.file.thumbnailLink;
  }
}

function clearAuthError() {
  el.authHint.textContent = 'Google 로그인에서 계정과 Drive 권한을 확인합니다.';
  el.authHint.classList.remove('error');
}

function showToast(message) {
  clearTimeout(toastTimer);
  el.toast.textContent = message;
  el.toast.hidden = false;
  toastTimer = setTimeout(() => { el.toast.hidden = true; }, 3600);
}

function beginLibraryStatus(message, { progress = false } = {}) {
  const token = state.libraryStatusToken + 1;
  state.libraryStatusToken = token;
  showLibraryStatusMessage(message, progress);
  return token;
}

function updateLibraryStatus(token, message, { progress = false } = {}) {
  if (token !== state.libraryStatusToken) return false;
  showLibraryStatusMessage(message, progress);
  return true;
}

// Work in flight speaks once, in the summary line beside its spinner; the line
// under the toolbar keeps only results, errors and notices (D119).
function showLibraryStatusMessage(message, progress) {
  const previous = state.libraryProgressText || '';
  state.libraryProgressText = progress ? (message || '') : '';
  if (el.libraryStatus) el.libraryStatus.textContent = progress ? '' : (message || '');
  if (previous !== state.libraryProgressText && el.librarySummary) updateLibrarySummary();
}

function clearLibraryStatus() {
  return beginLibraryStatus('');
}

function humanizeDriveError(error) {
  if (error?.code === 'insufficient_scope') return error.message;
  if (error?.code === 'candidate_read_only') return '현재 검증 후보는 계정 상태 비교가 끝날 때까지 Drive 변경을 잠시 막습니다.';
  if (error.status === 401) return '인증이 만료됐습니다.';
  if (error.status === 403) {
    const reasons = Array.isArray(error.reasons) ? error.reasons : [];
    if (reasons.some((reason) => /accessNotConfigured|serviceDisabled/i.test(reason))) {
      return 'Google Cloud 프로젝트에서 Drive API를 사용 설정해 주세요.';
    }
    if (reasons.some((reason) => /^insufficientPermissions$/i.test(reason))) {
      return '이 기능의 Google 권한이 부족합니다. 다시 연결해 주세요.';
    }
    return '현재 계정에서 이 Drive 항목에 접근할 권한이 없습니다.';
  }
  if (error.status === 404) return '파일이 삭제되었거나 현재 계정에서 더 이상 볼 수 없습니다.';
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
    { id: 'demo-video-1', name: '서울 야간 산책 — 4K.mov', mimeType: 'video/quicktime', size: '4873258598', modifiedTime: '2026-08-15T08:30:00Z', createdTime: '2026-07-02T11:00:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(0), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '437000' } },
    { id: 'demo-image-1', name: '한강 원본 사진.heic', mimeType: 'image/heic', size: '12845032', modifiedTime: '2026-08-14T12:10:00Z', createdTime: '2026-08-14T12:10:00Z', capabilities: { canDownload: true }, parents: ['root'], thumbnailLink: demoImageDataUrl(1), imageMediaMetadata: { width: 5712, height: 4284 } },
    { id: 'demo-video-2', name: '강의 녹화 03.mp4', mimeType: 'video/mp4', size: '2137483648', modifiedTime: '2026-08-13T05:40:00Z', createdTime: '2026-03-21T09:15:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(2), videoMediaMetadata: { width: 1920, height: 1080, durationMillis: '3842000' } },
    { id: 'demo-video-3', name: '여행 클립 — HEVC.mp4', mimeType: 'video/mp4', size: '876523100', modifiedTime: '2026-08-08T16:00:00Z', createdTime: '2026-08-08T15:40:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1'], thumbnailLink: demoImageDataUrl(3), videoMediaMetadata: { width: 3840, height: 2160, durationMillis: '187000' } },
    { id: 'demo-video-4', name: '도쿄 골목 — 세로 쇼츠.mp4', mimeType: 'video/mp4', size: '412556320', modifiedTime: '2026-08-07T09:00:00Z', createdTime: '2026-05-30T22:05:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-1-1'], thumbnailLink: demoImageDataUrl(4), videoMediaMetadata: { width: 2160, height: 3840, durationMillis: '221000' } },
    { id: 'demo-image-2', name: '문서 스캔 원본.png', mimeType: 'image/png', size: '24576000', modifiedTime: '2026-08-11T03:20:00Z', createdTime: '2025-12-01T06:00:00Z', capabilities: { canDownload: true }, parents: ['demo-folder-2'], thumbnailLink: demoImageDataUrl(4), imageMediaMetadata: { width: 4032, height: 3024 } }
  ];
  state.treeCache = buildTreeIndexes(demoItems);
  computeAndRenderSubtree();
  showLibrary();
  beginLibraryStatus('데모 모드 — 실제 Google Drive 요청은 실행하지 않습니다.');
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
