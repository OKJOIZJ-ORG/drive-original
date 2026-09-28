import { canonical, collectSnapshot, compareSnapshots, validateRawState } from '../v2-state-snapshot/snapshot.mjs';
import { compareLegacyReplica } from '../v2-state-snapshot/legacy-replica.mjs';

const MAX_BYTES = 32 * 1024 * 1024;
const LOCAL_BYTES = 8 * 1024 * 1024;
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const writer = value => typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value);
const codes = new Set(['invalid_contract', 'invalid_backup', 'invalid_json_data', 'byte_limit',
  'account_mismatch', 'stale_owner', 'candidate_changed', 'candidate_reconstruction_mismatch',
  'credential_field', 'backup_unavailable', 'backup_cleared', 'run_already_claimed',
  'pending_mismatch', 'reread_mismatch', 'malformed_state', 'unsupported_schema',
  'malformed_snapshot', 'snapshot_state_mismatch', 'empty_contract_mismatch', 'empty_baseline',
  'duplicate_file', 'duplicate_writer', 'malformed_catalog', 'unexpected_file',
  'invalid_transport', 'invalid_writer', 'read_only_required', 'invalid_json', 'missing_file',
  'read_failed', 'invalid_reader', 'request_limit', 'time_limit', 'cancelled', 'invalid_clock',
  'invalid_account', 'incomplete_catalog', 'file_limit', 'page_limit', 'repeated_page',
  'empty_snapshot', 'concurrent_change', 'invalid_limits', 'storage_unavailable']);
export class RecoveryBackupError extends Error {
  constructor(code) { super(code); this.name = 'RecoveryBackupError'; this.code = code; }
}
const fail = code => { throw new RecoveryBackupError(code); };
export function safeBackupFailure(cause) {
  return { passed: false, failure: codes.has(cause?.code) ? cause.code : 'invalid_backup' };
}
const exactKeys = (value, keys) => {
  if (!record(value) || Object.keys(value).some(key => !keys.includes(key))
    || keys.some(key => !Object.hasOwn(value, key))) fail('invalid_backup');
};
function contract({ expectedAccountId, normalize, merge, isCurrent }) {
  if (typeof expectedAccountId !== 'string' || !expectedAccountId || typeof normalize !== 'function'
    || typeof merge !== 'function' || typeof isCurrent !== 'function') fail('invalid_contract');
  if (isCurrent() !== true) fail('stale_owner');
}
// Reject lossy serialization (undefined/functions/accessors/NaN/cycles/toJSON).
// The node/depth caps bound traversal before JSON.stringify and canonical work.
function jsonText(value, maxBytes = MAX_BYTES) {
  let nodes = 0, characters = 0;
  const add = length => { characters += length; if (characters > maxBytes) fail('byte_limit'); };
  const path = new Set();
  const walk = (entry, depth) => {
    if (++nodes > 300_000 || depth > 16) fail('byte_limit');
    if (entry === null || typeof entry === 'boolean') return;
    if (typeof entry === 'string') { add(entry.length); return; }
    if (typeof entry === 'number') { if (!Number.isFinite(entry)) fail('invalid_json_data'); return; }
    if (typeof entry !== 'object' || path.has(entry)) fail('invalid_json_data');
    if (Object.prototype.toString.call(entry) !== (Array.isArray(entry) ? '[object Array]' : '[object Object]')) fail('invalid_json_data');
    path.add(entry);
    const descriptors = Object.getOwnPropertyDescriptors(entry);
    if (Object.getOwnPropertySymbols(entry).length) fail('invalid_json_data');
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(entry) && key === 'length') continue;
      add(key.length);
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail('invalid_json_data');
      walk(descriptor.value, depth + 1);
    }
    if (Array.isArray(entry) && Object.keys(entry).length !== entry.length) fail('invalid_json_data');
    path.delete(entry);
  };
  walk(value, 0);
  const text = JSON.stringify(value);
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) fail('byte_limit');
  return text;
}
function localState(text) {
  if (typeof text !== 'string' || text.length > LOCAL_BYTES) fail('invalid_backup');
  if (new TextEncoder().encode(text).byteLength > LOCAL_BYTES) fail('byte_limit');
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail('invalid_json'); }
  validateRawState(parsed);
  stateOnly(parsed);
  return parsed;
}
// Preserve established raw JSON, including benign extension fields. Reject
// known credential fields in control/extension objects, never interpret media
// IDs in favorites/viewed as credential property names.
function stateOnly(state) {
  const reserved = /^(?:.*token|credentials?|cookies?|authorization|clientsecret|password|secret)$/i;
  const inspect = value => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (reserved.test(key)) fail('credential_field');
      inspect(child);
    }
  };
  for (const [key, value] of Object.entries(state)) {
    if (key === 'viewed') continue;
    if (key === 'favorites') { for (const entry of Object.values(value)) inspect(entry); continue; }
    if (reserved.test(key)) fail('credential_field');
    inspect(value);
  }
}
const counts = value => ({ liked: Object.values(value.favorites).filter(entry => entry.liked).length,
  unliked: Object.values(value.favorites).filter(entry => !entry.liked).length,
  viewed: Object.keys(value.viewed).length });

function validate(payload, options) {
  contract(options);
  jsonText(payload);
  exactKeys(payload, ['privateRecoveryBackup', 'remote', 'candidate', 'legacyLocal', 'evidence']);
  if (payload.privateRecoveryBackup !== true) fail('invalid_backup');
  exactKeys(payload.evidence, ['projectClientBinding']);
  if (!['verified', 'unknown'].includes(payload.evidence.projectClientBinding)) fail('invalid_backup');
  const remote = payload.remote;
  exactKeys(remote, ['accountId', 'files', 'remote', 'stable', 'explicitlyEmpty', 'capture']);
  if (remote.accountId !== options.expectedAccountId) fail('account_mismatch');
  if (!Array.isArray(remote.files)) fail('malformed_snapshot');
  if (remote.files.length > 64) fail('byte_limit');
  exactKeys(remote.capture, ['requests', 'bytes', 'retries']);
  for (const [key, max] of [['requests', 100], ['bytes', LOCAL_BYTES], ['retries', 1]]) {
    if (!Number.isSafeInteger(remote.capture[key]) || remote.capture[key] < 0 || remote.capture[key] > max) fail('invalid_backup');
  }
  for (const file of remote.files) {
    if (!record(file)) fail('malformed_snapshot');
    const keys = ['id', 'name', 'modifiedTime', 'writer', 'schemaVersion', 'raw'];
    if (Object.hasOwn(file, 'version')) keys.push('version');
    exactKeys(file, keys);
    validateRawState(file.raw, file.name === 'drive-original-account-state.json');
    stateOnly(file.raw);
  }
  // All metadata/raw schemas/duplicate identities and the recomputed union are
  // checked by the maintained snapshot comparator, never a second merge engine.
  validateRawState(remote.remote);
  stateOnly(remote.remote);
  const comparison = compareSnapshots(remote, remote, options);
  const candidate = payload.candidate;
  exactKeys(candidate, ['accountId', 'cacheText', 'runtimeProjection', 'pending', 'writerId', 'writerStorageText']);
  if (candidate.accountId !== options.expectedAccountId) fail('account_mismatch');
  if (!writer(candidate.writerId) || !(candidate.writerStorageText === null || writer(candidate.writerStorageText))) fail('invalid_writer');
  if (typeof candidate.pending !== 'boolean') fail('invalid_backup');
  validateRawState(candidate.runtimeProjection);
  stateOnly(candidate.runtimeProjection);
  const cached = localState(candidate.cacheText);
  const reconstruction = options.merge(remote.remote, options.normalize(cached));
  if (canonical(reconstruction) !== canonical(options.normalize(candidate.runtimeProjection))) fail('candidate_reconstruction_mismatch');
  const pending = canonical(reconstruction) !== canonical(options.normalize(remote.remote));
  if (candidate.pending !== pending) fail('pending_mismatch');
  const legacy = payload.legacyLocal;
  exactKeys(legacy, ['privateTransport', 'origin', 'pathname', 'accountId', 'rawText', 'writerId', 'writerRead', 'repeatedReadsEqual']);
  if (legacy.writerRead !== true) fail('invalid_backup');
  stateOnly(localState(legacy.rawText));
  const legacyComparison = compareLegacyReplica({ payload: legacy, expectedAccountId: options.expectedAccountId,
    fence: { accountId: options.expectedAccountId, current: true, readOnly: true },
    candidateProjection: candidate.runtimeProjection, candidateWriterId: candidate.writerId,
    normalize: options.normalize, merge: options.merge, isCurrent: options.isCurrent });
  if (options.isCurrent() !== true) fail('stale_owner');
  return { passed: true, remoteFiles: remote.files.length,
    remoteWriters: remote.files.filter(file => file.writer !== null).length,
    remote: comparison.comparisonSummary.baseline, candidate: counts(options.normalize(candidate.runtimeProjection)),
    legacy: legacyComparison.legacy, candidatePending: pending,
    candidateIncludesLegacy: legacyComparison.candidateProjectionIncludesLegacy,
    legacyWriterAvailable: legacyComparison.legacyWriterAvailable,
    writerDistinct: legacyComparison.writerDistinct === true,
    runtimeMatchesRemoteAndCache: true,
    projectClientBindingVerified: payload.evidence.projectClientBinding === 'verified' };
}

/** PRIVATE: returned payload/text contain IDs and raw account state. Root owns
 * the private sink; never log/export to public reports, Git, cloud, or another
 * model. Only summary is public. Inputs are state-only, not whole app/auth state.
 */
export function createRecoveryBackup({ remoteSnapshot, candidate, legacyLocal,
  evidence = { projectClientBinding: 'unknown' },
  expectedAccountId, normalize, merge, isCurrent = () => true, approveEmptyBaseline = false } = {}) {
  const options = { expectedAccountId, normalize, merge, isCurrent, approveEmptyBaseline };
  const input = { privateRecoveryBackup: true, remote: remoteSnapshot, candidate, legacyLocal, evidence };
  const summary = validate(input, options);
  const privatePayload = JSON.parse(jsonText(input));
  if (isCurrent() !== true) fail('stale_owner');
  return { privatePayload, summary };
}

/** Injected collector uses GET only. readCandidate returns the six-field private
 * candidate contract above; raw local changes during collection fail closed.
 * Supplied legacyLocal has its own approved repeated-read capture provenance.
 */
export async function captureRecoveryBackup({ read, readCandidate, legacyLocal,
  evidence = { projectClientBinding: 'unknown' },
  expectedAccountId, normalize, merge, isCurrent = () => true, clock, signal, limits } = {}) {
  const options = { expectedAccountId, normalize, merge, isCurrent };
  contract(options);
  if (typeof readCandidate !== 'function') fail('invalid_contract');
  if (signal?.aborted) fail('cancelled');
  const before = JSON.parse(jsonText(readCandidate()));
  const legacy = JSON.parse(jsonText(legacyLocal));
  const remoteSnapshot = await collectSnapshot({ read, expectedAccountId, normalize, merge, isCurrent, clock, signal, limits });
  if (isCurrent() !== true) fail('stale_owner');
  if (signal?.aborted) fail('cancelled');
  const after = readCandidate();
  jsonText(after);
  if (canonical(before) !== canonical(after)) fail('candidate_changed');
  jsonText(legacyLocal);
  if (canonical(legacy) !== canonical(legacyLocal)) fail('candidate_changed');
  return createRecoveryBackup({ remoteSnapshot, candidate: before, legacyLocal: legacy, evidence, ...options });
}

export function serializePrivateBackup(privatePayload, options) {
  validate(privatePayload, { isCurrent: () => true, ...options });
  return jsonText(privatePayload);
}

/** A reread is checked against retained original evidence, not itself. This
 * verifies round-trip recovery data, not sink durability or write-time freshness.
 */
export function verifyRecoveryReread({ original, rereadText, expectedAccountId, normalize, merge,
  isCurrent = () => true, approveEmptyBaseline = false } = {}) {
  const options = { expectedAccountId, normalize, merge, isCurrent, approveEmptyBaseline };
  validate(original, options);
  if (typeof rereadText !== 'string') fail('invalid_backup');
  if (rereadText.length > MAX_BYTES || new TextEncoder().encode(rereadText).byteLength > MAX_BYTES) fail('byte_limit');
  let recovered;
  try { recovered = JSON.parse(rereadText); } catch { fail('invalid_json'); }
  const summary = validate(recovered, options);
  if (canonical(original) !== canonical(recovered)) fail('reread_mismatch');
  if (isCurrent() !== true) fail('stale_owner');
  return { ...summary, rereadEquivalent: true };
}
