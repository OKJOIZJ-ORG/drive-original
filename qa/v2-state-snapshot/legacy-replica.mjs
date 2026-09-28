import { canonical, validateRawState } from './snapshot.mjs';

const LEGACY_ORIGIN = 'https://okjoizj-org.github.io';
const LEGACY_PATH = '/drive-original/version.json';
const CACHE_PREFIX = 'drive-original.account-state.';
const WRITER_KEY = 'drive-original.account-writer';
const MAX_BYTES = 8 * 1024 * 1024;
const codes = new Set(['invalid_contract', 'wrong_origin', 'account_mismatch', 'stale_owner',
  'read_only_required', 'legacy_cache_absent', 'storage_unavailable', 'byte_limit',
  'malformed_state', 'unsupported_schema', 'invalid_writer', 'storage_changed', 'invalid_transport']);
export class LegacyReplicaError extends Error {
  constructor(code) { super(code); this.name = 'LegacyReplicaError'; this.code = code; }
}
const fail = code => { throw new LegacyReplicaError(code); };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const writerValid = value => value === null || (typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value));

export function safeLegacyFailure(cause) {
  return { passed: false, failure: codes.has(cause?.code) ? cause.code : 'invalid_contract',
    writeAuthorization: false, remoteVerified: false, deviceVerified: false };
}

function fenceValid(expectedAccountId, fence) {
  if (typeof expectedAccountId !== 'string' || !expectedAccountId || !record(fence)) fail('invalid_contract');
  if (fence.accountId !== expectedAccountId) fail('account_mismatch');
  if (fence.current !== true) fail('stale_owner');
  if (fence.readOnly !== true) fail('read_only_required');
}
function boundedText(text, maxBytes) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1 || maxBytes > MAX_BYTES) fail('invalid_contract');
  if (typeof text !== 'string') fail('invalid_transport');
  if (text.length > maxBytes || new TextEncoder().encode(text).byteLength > maxBytes) fail('byte_limit');
  return text;
}
function parseReplica(text, maxBytes) {
  boundedText(text, maxBytes);
  let raw;
  try { raw = JSON.parse(text); } catch { fail('malformed_state'); }
  // A cache is written by the established schema-1 normalizer. Unlike the
  // schema-less legacy remote document, a schema-less local cache is not proof.
  try { validateRawState(raw); } catch (cause) { fail(codes.has(cause?.code) ? cause.code : 'malformed_state'); }
  return raw;
}
const counts = state => ({ viewed: Object.keys(state.viewed).length,
  liked: Object.values(state.favorites).filter(entry => entry.liked).length,
  unliked: Object.values(state.favorites).filter(entry => !entry.liked).length });

/** PRIVATE BOUNDARY: the returned payload contains account ID, raw cache and
 * optional writer ID. Keep it only in the coordinator's CUA in-memory runtime.
 * Never print, log, hash, persist, upload or attach it. Absence means this profile
 * has no exact account cache; it does not establish that another profile lacks it.
 * The supplied fence is trusted coordinator evidence, not an inert-page login.
 */
export function readLegacyReplica({ storage, origin, pathname, expectedAccountId, fence,
  readWriter = true, maxBytes = MAX_BYTES, isCurrent = () => true } = {}) {
  fenceValid(expectedAccountId, fence);
  if (origin !== LEGACY_ORIGIN || pathname !== LEGACY_PATH) fail('wrong_origin');
  if (typeof storage?.getItem !== 'function' || typeof isCurrent !== 'function' || typeof readWriter !== 'boolean') fail('invalid_contract');
  if (isCurrent() !== true) fail('stale_owner');
  const key = CACHE_PREFIX + expectedAccountId;
  const get = name => { try { return storage.getItem(name); } catch { fail('storage_unavailable'); } };
  const first = get(key);
  if (first === null) fail('legacy_cache_absent');
  parseReplica(first, maxBytes);
  const writer = readWriter ? get(WRITER_KEY) : null;
  if (!writerValid(writer)) fail('invalid_writer');
  const second = get(key);
  const secondWriter = readWriter ? get(WRITER_KEY) : null;
  if (first !== second || writer !== secondWriter) fail('storage_changed');
  if (isCurrent() !== true) fail('stale_owner');
  return { privateTransport: true, origin, pathname, accountId: expectedAccountId,
    rawText: first, writerId: writer, writerRead: readWriter, repeatedReadsEqual: true };
}

/** PUBLIC RESULT: aggregates only. Exact raw storage equality and account/source
 * checks validate transferred input; approved coordinator capture provenance is
 * still required. This comparison proves projection inclusion under the actual
 * app merge semantics, not remote upload, writer migration or device acceptance.
 */
export function compareLegacyReplica({ payload, expectedAccountId, fence, candidateProjection,
  candidateWriterId = null, normalize, merge, isCurrent = () => true, maxBytes = MAX_BYTES } = {}) {
  fenceValid(expectedAccountId, fence);
  if (!record(payload) || payload.privateTransport !== true || payload.repeatedReadsEqual !== true
    || payload.origin !== LEGACY_ORIGIN || payload.pathname !== LEGACY_PATH
    || typeof payload.writerRead !== 'boolean' || !writerValid(payload.writerId)
    || (!payload.writerRead && payload.writerId !== null)) fail('invalid_transport');
  if (payload.accountId !== expectedAccountId) fail('account_mismatch');
  if (typeof normalize !== 'function' || typeof merge !== 'function' || typeof isCurrent !== 'function') fail('invalid_contract');
  if (!writerValid(candidateWriterId)) fail('invalid_writer');
  if (isCurrent() !== true) fail('stale_owner');
  const raw = parseReplica(payload.rawText, maxBytes);
  try { validateRawState(candidateProjection); } catch (cause) { fail(codes.has(cause?.code) ? cause.code : 'malformed_state'); }
  const before = normalize(candidateProjection), legacy = normalize(raw);
  const merged = merge(before, legacy);
  const addsOrChanges = canonical(merged) !== canonical(before);
  const viewedAdded = Object.keys(merged.viewed).filter(id => !Object.prototype.hasOwnProperty.call(before.viewed, id)).length;
  const viewedChanged = Object.keys(before.viewed).filter(id => merged.viewed[id] !== before.viewed[id]).length;
  const favoritesAdded = Object.keys(merged.favorites).filter(id => !Object.prototype.hasOwnProperty.call(before.favorites, id)).length;
  const favoritesChanged = Object.keys(before.favorites).filter(id => canonical(merged.favorites[id]) !== canonical(before.favorites[id])).length;
  if (isCurrent() !== true) fail('stale_owner');
  return { passed: true, candidateProjectionIncludesLegacy: !addsOrChanges, mergeAddsOrChanges: addsOrChanges,
    legacy: counts(legacy), candidate: counts(before), merged: counts(merged),
    viewedAdded, viewedChanged, favoritesAdded, favoritesChanged,
    legacyWriterAvailable: payload.writerId !== null, candidateWriterAvailable: candidateWriterId !== null,
    writerDistinct: payload.writerId !== null && candidateWriterId !== null ? payload.writerId !== candidateWriterId : null,
    writeAuthorization: false, remoteVerified: false, deviceVerified: false };
}
