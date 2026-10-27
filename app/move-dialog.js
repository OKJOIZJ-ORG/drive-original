'use strict';

// Move dialog: destination list, recent folders, server search and the folder index.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

/* 폴더 이동 — 최근 이동 폴더와 서버 검색은 바로 보이고, 전체 폴더 목록은 뒤에서 1회 수집한다 */
async function requestMoveFile() {
  const files = getActionFiles();
  if (!files.length) return;
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
