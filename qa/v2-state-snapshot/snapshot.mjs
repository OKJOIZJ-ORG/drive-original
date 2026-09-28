// QA only. Keep returned snapshots private; only comparisonSummary is report-safe.
const API = 'https://www.googleapis.com/drive/v3';
const LEGACY = 'drive-original-account-state.json';
const WRITER = /^drive-original-account-state-v2-([A-Za-z0-9_-]+)\.json$/;
const DEFAULT_LIMITS = Object.freeze({ requests: 100, bytes: 8 * 1024 * 1024, milliseconds: 30_000, files: 64, pages: 16 });

export class SnapshotError extends Error {
  constructor(code) { super(code); this.name = 'SnapshotError'; this.code = code; }
}
const fail = code => { throw new SnapshotError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const timestamp = value => Number.isSafeInteger(value) && value >= 0;
const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (record(value)) return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

// Accept the established schema and legacy boolean favorites; do not silently
// turn an unknown schema or malformed body into an empty normalized state.
export function validateRawState(value, legacy = false) {
  if (!record(value) || !record(value.viewed) || !record(value.favorites)) fail('malformed_state');
  if (value.schemaVersion !== 1 && !(legacy && !own(value, 'schemaVersion'))) fail('unsupported_schema');
  if (own(value, 'updatedAt') && !timestamp(value.updatedAt)) fail('malformed_state');
  for (const [id, time] of Object.entries(value.viewed)) {
    if (!id || !timestamp(time) || time === 0) fail('malformed_state');
  }
  for (const [id, entry] of Object.entries(value.favorites)) {
    if (!id) fail('malformed_state');
    if (typeof entry === 'boolean') continue;
    if (!record(entry) || typeof entry.liked !== 'boolean' || !timestamp(entry.updatedAt)) fail('malformed_state');
  }
  return value;
}

function validatedLimits(input) {
  const limits = { ...DEFAULT_LIMITS, ...input };
  for (const key of Object.keys(DEFAULT_LIMITS)) {
    if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > DEFAULT_LIMITS[key]) fail('invalid_limits');
  }
  return limits;
}

function validateMetadata(file) {
  if (!record(file) || typeof file.id !== 'string' || !file.id || typeof file.name !== 'string'
    || typeof file.modifiedTime !== 'string' || !file.modifiedTime
    || (own(file, 'version') && (typeof file.version !== 'string' || !/^\d+$/.test(file.version)))) fail('malformed_catalog');
  const writer = WRITER.exec(file.name);
  if (file.name !== LEGACY && !writer) fail('unexpected_file');
  return { id: file.id, name: file.name, modifiedTime: file.modifiedTime,
    ...(own(file, 'version') ? { version: file.version } : {}), writer: writer?.[1] || null };
}

/**
 * read(url, {method:'GET', signal}) must return a standard streaming Response.
 * normalize/merge are the application's existing functions, injected by caller.
 * expectedAccountId is Drive about.user.permissionId, NOT the auth HMAC key.
 * All results except comparisonSummary contain private state and must stay local.
 */
export async function collectSnapshot({ read, normalize, merge, expectedAccountId,
  isCurrent = () => true, clock = () => Date.now(), signal, limits: inputLimits = {},
  allowEmpty = false } = {}) {
  if (typeof read !== 'function' || typeof normalize !== 'function' || typeof merge !== 'function'
    || typeof isCurrent !== 'function' || typeof clock !== 'function'
    || typeof expectedAccountId !== 'string' || !expectedAccountId) fail('invalid_contract');
  const limits = validatedLimits(inputLimits);
  const started = clock();
  if (!Number.isFinite(started)) fail('invalid_clock');
  const controller = new AbortController();
  let timedOut = false, requests = 0, bytes = 0;
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, limits.milliseconds);
  const abort = () => controller.abort();
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  const check = () => {
    const elapsed = clock() - started;
    if (!Number.isFinite(elapsed) || elapsed < 0) fail('invalid_clock');
    if (timedOut || elapsed >= limits.milliseconds) fail('time_limit');
    if (signal?.aborted || controller.signal.aborted) fail('cancelled');
    if (isCurrent() !== true) fail('stale_owner');
  };
  const bounded = operation => new Promise((resolve, reject) => {
    const interrupted = () => {
      try { check(); fail('cancelled'); } catch (error) { reject(error); }
    };
    controller.signal.addEventListener('abort', interrupted, { once: true });
    Promise.resolve(operation).then(resolve, reject).finally(() => controller.signal.removeEventListener('abort', interrupted));
    if (controller.signal.aborted) interrupted();
  });
  const get = async url => {
    check();
    if (++requests > limits.requests) fail('request_limit');
    let response;
    try { response = await bounded(read(url, { method: 'GET', signal: controller.signal })); }
    catch { check(); fail('read_failed'); }
    check();
    if (response?.status === 404) fail('missing_file');
    if (!response?.ok) fail('read_failed');
    if (!response.body?.getReader) fail('invalid_reader');
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;
    try {
      for (;;) {
        check();
        const chunk = await bounded(reader.read());
        check();
        if (chunk.done) break;
        if (!(chunk.value instanceof Uint8Array)) fail('invalid_reader');
        bytes += chunk.value.byteLength;
        if (bytes > limits.bytes) fail('byte_limit');
        length += chunk.value.byteLength;
        chunks.push(chunk.value);
      }
    } catch (error) {
      // Standard fetch readers observe abort; an injected reader must do so too.
      void reader.cancel().catch(() => {});
      check();
      if (error instanceof SnapshotError) throw error;
      fail('read_failed');
    } finally { try { reader.releaseLock(); } catch {} }
    const content = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) { content.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)); }
    catch { fail('invalid_json'); }
  };
  const account = async () => {
    const result = await get(`${API}/about?fields=user(permissionId)`);
    const id = result?.user?.permissionId;
    if (typeof id !== 'string' || !id) fail('invalid_account');
    if (id !== expectedAccountId) fail('account_mismatch');
    return id;
  };
  const catalog = async () => {
    const files = [], ids = new Set(), names = new Set(), tokens = new Set();
    let token = null, pages = 0;
    do {
      if (++pages > limits.pages) fail('page_limit');
      const query = new URLSearchParams({ spaces: 'appDataFolder', pageSize: '1000',
        q: `(name = '${LEGACY}' or name contains 'drive-original-account-state-v2-') and trashed = false`,
        fields: 'nextPageToken,incompleteSearch,files(id,name,modifiedTime,version)' });
      if (token) query.set('pageToken', token);
      const page = await get(`${API}/files?${query}`);
      if (!record(page) || !Array.isArray(page.files)) fail('malformed_catalog');
      if (page.incompleteSearch === true) fail('incomplete_catalog');
      if (own(page, 'incompleteSearch') && typeof page.incompleteSearch !== 'boolean') fail('malformed_catalog');
      for (const value of page.files) {
        const file = validateMetadata(value);
        if (ids.has(file.id)) fail('duplicate_file');
        if (names.has(file.name)) fail('duplicate_writer');
        ids.add(file.id); names.add(file.name); files.push(file);
        if (files.length > limits.files) fail('file_limit');
      }
      token = page.nextPageToken ?? null;
      if (token !== null && (typeof token !== 'string' || !token)) fail('malformed_catalog');
      if (token && tokens.has(token)) fail('repeated_page');
      if (token) tokens.add(token);
    } while (token);
    return files.sort((a, b) => a.id.localeCompare(b.id));
  };
  const cache = new Map();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const accountId = await account();
      const before = await catalog();
      if (!before.length && allowEmpty !== true) fail('empty_snapshot');
      const documents = [];
      for (const file of before) {
        const key = canonical(file);
        let raw = cache.get(key);
        if (!raw) {
          raw = validateRawState(await get(`${API}/files/${encodeURIComponent(file.id)}?alt=media`), file.name === LEGACY);
          cache.set(key, raw);
        }
        documents.push({ ...file, schemaVersion: raw.schemaVersion ?? null, raw });
      }
      const after = await catalog();
      await account();
      check();
      if (canonical(before) !== canonical(after)) {
        if (attempt === 0) continue;
        fail('concurrent_change');
      }
      let remote = normalize({});
      for (const file of documents) remote = merge(remote, normalize(file.raw));
      const empty = !Object.keys(remote.favorites).length && !Object.keys(remote.viewed).length;
      if (empty && allowEmpty !== true) fail('empty_snapshot');
      const snapshot = { accountId, files: documents, remote, stable: true, explicitlyEmpty: allowEmpty === true && empty,
        capture: { requests, bytes, retries: attempt } };
      return snapshot;
    }
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener('abort', abort);
    controller.abort();
  }
}

function counts(state) {
  const favorites = Object.values(state.favorites);
  return { liked: favorites.filter(entry => entry.liked).length, unliked: favorites.filter(entry => !entry.liked).length,
    viewed: Object.keys(state.viewed).length };
}

// Structural integrity is checked again on transfer/re-import. It cannot prove
// that an external snapshot's stable flag came from a live approved capture.
function validateSnapshot(snapshot, normalize, merge) {
  if (!record(snapshot) || snapshot.stable !== true || typeof snapshot.accountId !== 'string' || !snapshot.accountId
    || !Array.isArray(snapshot.files) || typeof snapshot.explicitlyEmpty !== 'boolean') fail('malformed_snapshot');
  validateRawState(snapshot.remote);
  const ids = new Set(), names = new Set();
  let recomputed = normalize({});
  for (const document of snapshot.files) {
    const metadata = validateMetadata(document);
    if (ids.has(metadata.id)) fail('duplicate_file');
    if (names.has(metadata.name)) fail('duplicate_writer');
    ids.add(metadata.id); names.add(metadata.name);
    const raw = validateRawState(document.raw, metadata.name === LEGACY);
    if (document.writer !== metadata.writer || document.schemaVersion !== (raw.schemaVersion ?? null)) fail('malformed_snapshot');
    recomputed = merge(recomputed, normalize(raw));
  }
  if (canonical(recomputed) !== canonical(snapshot.remote)) fail('snapshot_state_mismatch');
  const empty = !Object.keys(recomputed.favorites).length && !Object.keys(recomputed.viewed).length;
  if (snapshot.explicitlyEmpty !== empty) fail('empty_contract_mismatch');
  return recomputed;
}

/** Remote evidence and local replica are separate; this does not authorize writes. */
export function compareSnapshots(baseline, candidate, { normalize, merge,
  localReplica = null, localReplicaAccountId = null, approveEmptyBaseline = false } = {}) {
  if (typeof normalize !== 'function' || typeof merge !== 'function') fail('invalid_contract');
  const baselineRemote = validateSnapshot(baseline, normalize, merge);
  const candidateRemote = validateSnapshot(candidate, normalize, merge);
  if (!baseline.accountId || baseline.accountId !== candidate.accountId) fail('account_mismatch');
  const emptyBaseline = !Object.keys(baselineRemote.favorites).length && !Object.keys(baselineRemote.viewed).length;
  const emptyCandidate = !Object.keys(candidateRemote.favorites).length && !Object.keys(candidateRemote.viewed).length;
  if (emptyBaseline && !(approveEmptyBaseline === true && baseline.explicitlyEmpty === true
    && candidate.explicitlyEmpty === true && emptyCandidate)) fail('empty_baseline');
  const identity = snapshot => snapshot.files.map(({ raw, ...file }) => file).sort((a, b) => a.id.localeCompare(b.id));
  const sameFiles = canonical(identity(baseline)) === canonical(identity(candidate));
  const sameDocuments = canonical(baseline.files.map(file => ({ id: file.id, raw: file.raw })).sort((a, b) => a.id.localeCompare(b.id)))
    === canonical(candidate.files.map(file => ({ id: file.id, raw: file.raw })).sort((a, b) => a.id.localeCompare(b.id)));
  const sameRemote = canonical(baselineRemote) === canonical(candidateRemote);
  let local = null;
  if (localReplica !== null) {
    if (localReplicaAccountId !== baseline.accountId) fail('local_account_mismatch');
    validateRawState(localReplica, true);
    const replica = normalize(localReplica);
    local = { replica, reconstruction: merge(candidate.remote, replica),
      pending: canonical(merge(candidate.remote, replica)) !== canonical(normalize(candidate.remote)) };
  }
  return { comparisonSummary: {
    remoteEquivalent: sameFiles && sameDocuments && sameRemote,
    sameFiles, sameDocuments, sameRemote,
    baseline: { files: baseline.files.length, ...counts(normalize(baseline.remote)) },
    candidate: { files: candidate.files.length, ...counts(normalize(candidate.remote)) },
    localReplicaPresent: local !== null, localPending: Boolean(local?.pending),
    writeAuthorization: false
  }, local };
}
