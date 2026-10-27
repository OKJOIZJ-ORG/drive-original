'use strict';

// Verified Drive mutations (trash, move, rename): per-account ledger, pre-read,
// single PATCH, independent GET confirmation and read-only recovery.
// One of the ordered classic scripts listed in scripts/app-scripts.cjs; all share one global scope.

const DRIVE_MUTATION_PREFIX = 'drive-original.mutation.v1.';
const DRIVE_MUTATION_FIELDS = 'id,name,parents,trashed,version,driveId,mimeType,resourceKey,shortcutDetails,ownedByMe,appProperties,capabilities(canTrash,canRename,canMoveItemWithinDrive,canMoveItemOutOfDrive,canAddChildren)';
const DRIVE_MUTATION_ACTIONS = ['trash', 'move', 'rename'];
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
        || !row.fileId || !DRIVE_MUTATION_ACTIONS.includes(row.action) || typeof row.intent !== 'string') throw new Error('Invalid ledger');
      entries.push(row);
    }
    return entries;
  } catch (_) {
    throw driveMutationError('uncertain', '이전 작업 기록을 읽지 못했습니다. 다시 연결해 확인해 주세요.');
  }
}

function persistDriveMutation(entry, owner, nextState) {
  // Origin ownership is immutable even if a response arrives after switching
  // accounts. No token, file name or media body is retained here; a rename
  // keeps only the SHA-256 of the requested and observed names.
  entry.state = nextState;
  entry.updatedAt = Date.now();
  if (nextState === 'confirmed' && !entry.confirmedAt) {
    entry.confirmedAt = entry.updatedAt;
    entry.confirmedAfter = entry.after;
  }
  const compactMetadata = value => value ? { id: value.id, parents: value.parents,
    trashed: value.trashed, version: value.version, driveId: value.driveId, nameHash: value.nameHash ?? null } : null;
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
  const raw = await response.json();
  const metadata = driveMutationMetadata(raw, file.id, { rootAlias });
  metadata.nameHash = typeof raw?.name === 'string' ? await driveNameDigest(raw.name) : null;
  owner.assert();
  return metadata;
}

async function driveNameDigest(name) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) throw driveMutationError('failed', '안전한 파일 작업을 지원하는 최신 브라우저에서 다시 시도해 주세요.');
  const bytes = new Uint8Array(await subtle.digest('SHA-256', new TextEncoder().encode(name)));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function driveMutationMatches(entry, metadata) {
  if (entry.action === 'trash') return metadata.trashed === true;
  if (entry.action === 'rename') return !metadata.trashed && Boolean(entry.nameHash) && metadata.nameHash === entry.nameHash;
  return !metadata.trashed && metadata.parents.length === 1 && metadata.parents[0] === entry.targetId;
}

function driveMutationPreStateMatches(before, after) {
  return Boolean(before && after) && before.trashed === after.trashed && before.driveId === after.driveId
    && JSON.stringify(before.parents) === JSON.stringify(after.parents)
    && (before.nameHash == null || after.nameHash == null || before.nameHash === after.nameHash)
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

async function executeDriveMutation(file, action, targetRow = null, { operationId = null, retryUnchanged = false, name = null } = {}) {
  if (!DRIVE_MUTATION_ACTIONS.includes(action) || typeof file?.id !== 'string' || !file.id
    || (action === 'move' && (typeof targetRow?.id !== 'string' || !targetRow.id))
    || (action === 'rename' && (typeof name !== 'string' || !name.trim()))) {
    throw driveMutationError('failed', '작업할 파일과 폴더를 다시 선택해 주세요.');
  }
  // Freeze intent inputs before the first asynchronous boundary. Background
  // listing refresh must not silently change an already requested pre-state.
  file = { ...file, parents: Array.isArray(file.parents) ? [...file.parents] : undefined };
  targetRow = action === 'move' && targetRow ? { ...targetRow } : null;
  const owner = captureDriveMutationOwner();
  const disposableScope = !DRIVE_MUTATIONS_ENABLED ? disposableDriveMutations.select(owner, file, action, targetRow) : null;
  const nameHash = action === 'rename' ? await driveNameDigest(name) : null;
  const intent = JSON.stringify({ fileId: file.id, action, target: targetRow?.id || null,
    expectedParents: Array.isArray(file.parents) ? [...file.parents].sort() : null, expectedVersion: file.version || null,
    ...(nameHash ? { nameHash } : {}) });
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
      resourceKey: file.resourceKey || '', targetId: targetRow?.id || null, nameHash, before: null, rejectionStatus: 0 };
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
      const capability = action === 'trash' ? 'canTrash' : action === 'rename' ? 'canRename' : moveCapability;
      if (before.trashed && action === 'rename') throw driveMutationError('failed', '휴지통에 있는 파일은 이름을 바꿀 수 없습니다.');
      if (before.capabilities[capability] !== true) {
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
          body: action === 'trash' ? JSON.stringify({ trashed: true }) : action === 'rename' ? JSON.stringify({ name }) : '{}'
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
