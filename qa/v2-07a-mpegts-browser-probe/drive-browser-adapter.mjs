import {
  BoundedProbeError,
  DEFAULT_LIMITS,
  FAILURE_CODES,
  runBoundedProbeBatch
} from '../v2-07a-bounded-probe/bounded-probe.mjs';
import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { selectRiskRepresentatives } from '../v2-07a-representative-selection/representative-selector.mjs';
import { probeMpegTs } from '../v2-07a-container-probe/mpeg-ts-probe.mjs';

const CANDIDATE_ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const CANDIDATE_VERSION = '1.22.0-rc.4';
const MANIFEST_SCHEMA = 'drive-original.v2-07a-risk-selection-private/1';
const OUTPUT_SCHEMA = 'drive-original.v2-07a-mpeg-ts-browser-probe-aggregate/1';
const REPRESENTATIVE_COUNT = 38;
const FRONT_BYTES = 65_536;
const PROBE_MEDIA_SESSION = Number.MAX_SAFE_INTEGER;
const PROBE_SOURCE_GENERATION = Number.MAX_SAFE_INTEGER;
const MAX_DRIVE_REQUESTS = 512;
const MAX_RUN_MS = 10 * 60_000;
const DRIVE_FIELDS = 'id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey';
const LIMITS = Object.freeze({
  requestBytes: FRONT_BYTES,
  fileBytes: FRONT_BYTES,
  fileRequests: 1,
  batchBytes: REPRESENTATIVE_COUNT * FRONT_BYTES,
  headersMs: DEFAULT_LIMITS.headersMs,
  bodyNoProgressMs: DEFAULT_LIMITS.bodyNoProgressMs,
  fileMs: DEFAULT_LIMITS.fileMs
});
const MPEG_TS_LIMITS = Object.freeze({
  maxBytes: FRONT_BYTES,
  maxPackets: Math.floor(FRONT_BYTES / 188),
  maxResyncBytes: 188 * 8,
  maxSectionBytes: 1_024,
  maxSections: 128,
  maxPrograms: 64,
  maxStreamsPerProgram: 64,
  maxTotalStreams: 128,
  maxElementaryBytesPerStream: 32 * 1_024,
  maxIssues: 64
});

const ADAPTER_FAILURE_CODES = Object.freeze([
  'MANIFEST_INVALID',
  'PRIVATE_CONTEXT_INVALID',
  'RUNTIME_REJECTED',
  'INVENTORY_FAILED',
  'SELECTION_FAILED',
  'RUN_ALREADY_CLAIMED',
  'REQUEST_LIMIT',
  'REQUEST_POLICY_REJECTED',
  'RUN_TIMEOUT',
  'ADAPTER_FAILURE'
]);
const FIXED_FAILURE_CODES = Object.freeze([...FAILURE_CODES, ...ADAPTER_FAILURE_CODES]);
const FIXED_FAILURE_CODE_SET = new Set(FIXED_FAILURE_CODES);
const MAGIC_ROUTES = Object.freeze([
  'iso-bmff', 'mpeg-ts', 'webm', 'matroska', 'ebml', 'avi', 'webp', 'bmp',
  'jpeg', 'png', 'gif', 'error-payload', 'unknown'
]);
const MAGIC_ROUTE_SET = new Set(MAGIC_ROUTES);
const MPEG_TS_OUTCOMES = Object.freeze([
  'MPEG_TS_STRUCTURE_COMPLETE',
  'PROBE_LIMIT_REACHED',
  'UNSUPPORTED_TS_FEATURE',
  'MALFORMED_MPEG_TS',
  'TRUNCATED_MPEG_TS',
  'PSI_NOT_COMPLETE',
  'TS_SYNC_NOT_FOUND',
  'INPUT_TYPE_INVALID',
  'BYTE_LIMIT_EXCEEDED',
  'PARSER_RESULT_INVALID'
]);
const MPEG_TS_OUTCOME_SET = new Set(MPEG_TS_OUTCOMES);
const SIGNALLING_CATEGORIES = Object.freeze(['none', 'target-only', 'other-only', 'mixed']);
const PROFILE_EVIDENCE_CATEGORIES = Object.freeze([
  'not-applicable', 'target-confirmed', 'other-parsed', 'inconclusive'
]);
const TOP_LEVEL_FIELDS = Object.freeze(['prioritySample', 'schema', 'selected']);
const PRIORITY_FIELDS = Object.freeze(['fileId', 'version']);
const ROW_FIELDS = Object.freeze([
  'coveredCategories', 'fileId', 'mandatoryReasons', 'mimeType', 'modifiedTime',
  'size', 'version', 'visibleReferences', 'extension'
].sort());
const REFERENCE_FIELDS = Object.freeze(['fileId', 'resourceKey']);
const PRIVATE_CONTEXT_FIELDS = Object.freeze([
  'accountKey', 'generation', 'priorityFileId', 'priorityVersion', 'rootId'
]);

class AdapterError extends Error {
  constructor(code) {
    super(FIXED_FAILURE_CODE_SET.has(code) ? code : 'ADAPTER_FAILURE');
    this.name = 'AdapterError';
    this.code = FIXED_FAILURE_CODE_SET.has(code) ? code : 'ADAPTER_FAILURE';
  }
}

function fail(code) {
  throw new AdapterError(code);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactFields(value, fields) {
  return isPlainObject(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...fields].sort());
}

function zeroCounts(keys) {
  return Object.fromEntries(keys.map((key) => [key, 0]));
}

function safeId(value) {
  return typeof value === 'string' && value.length <= 512 && /^[A-Za-z0-9_-]+$/.test(value);
}

function nullableIntegerText(value) {
  return value === null || (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value));
}

function nullablePrivateText(value, maximum) {
  return value === null || (typeof value === 'string'
    && value.length > 0 && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value));
}

function strictVersion(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) ? value : null;
}

function strictPositiveSize(value) {
  return typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value) && BigInt(value) > 0n
    ? value
    : null;
}

function strictModifiedTime(value) {
  if (typeof value !== 'string'
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value ? null : value;
}

function strictMimeType(value) {
  return typeof value === 'string'
    && /^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(value)
    ? value
    : null;
}

function validateStringSet(value) {
  if (!Array.isArray(value)) return false;
  const seen = new Set();
  for (const entry of value) {
    if (typeof entry !== 'string' || entry.length === 0 || entry.length > 512
      || /[\u0000-\u001f\u007f]/.test(entry) || seen.has(entry)) return false;
    seen.add(entry);
  }
  return true;
}

function normalizeManifest(value) {
  if (!exactFields(value, TOP_LEVEL_FIELDS) || value.schema !== MANIFEST_SCHEMA
    || !exactFields(value.prioritySample, PRIORITY_FIELDS)
    || !safeId(value.prioritySample.fileId)
    || !nullableIntegerText(value.prioritySample.version)
    || !Array.isArray(value.selected)
    || value.selected.length !== REPRESENTATIVE_COUNT) {
    fail('MANIFEST_INVALID');
  }

  const seenIds = new Set();
  const rows = value.selected.map((row) => {
    if (!exactFields(row, ROW_FIELDS) || !safeId(row.fileId) || seenIds.has(row.fileId)
      || !nullableIntegerText(row.version) || !nullableIntegerText(row.size)
      || !nullablePrivateText(row.modifiedTime, 64) || !nullablePrivateText(row.mimeType, 256)
      || !nullablePrivateText(row.extension, 128)
      || !validateStringSet(row.mandatoryReasons)
      || !validateStringSet(row.coveredCategories)
      || !Array.isArray(row.visibleReferences) || row.visibleReferences.length === 0) {
      fail('MANIFEST_INVALID');
    }
    seenIds.add(row.fileId);
    const nonNullResourceKeys = new Set();
    const seenReferences = new Set();
    for (const reference of row.visibleReferences) {
      if (!exactFields(reference, REFERENCE_FIELDS) || !safeId(reference.fileId)
        || (reference.resourceKey !== null
          && (typeof reference.resourceKey !== 'string'
            || !/^[A-Za-z0-9_-]+$/.test(reference.resourceKey)))) {
        fail('MANIFEST_INVALID');
      }
      const referenceKey = `${reference.fileId}\u0000${reference.resourceKey ?? ''}`;
      if (seenReferences.has(referenceKey)) fail('MANIFEST_INVALID');
      seenReferences.add(referenceKey);
      if (reference.resourceKey !== null) nonNullResourceKeys.add(reference.resourceKey);
    }
    if (nonNullResourceKeys.size > 1) fail('MANIFEST_INVALID');
    return Object.freeze({
      expectedIdentity: Object.freeze({
        accountKey: null,
        fileId: row.fileId,
        version: strictVersion(row.version),
        size: strictPositiveSize(row.size),
        modifiedTime: strictModifiedTime(row.modifiedTime),
        mimeType: strictMimeType(row.mimeType),
        canDownload: true
      }),
      resourceKey: nonNullResourceKeys.size === 1 ? [...nonNullResourceKeys][0] : null
    });
  });

  const priorityIndex = rows.findIndex(({ expectedIdentity }) => (
    expectedIdentity.fileId === value.prioritySample.fileId
  ));
  const priority = rows[priorityIndex];
  if (!priority || priority.expectedIdentity.version !== value.prioritySample.version) {
    fail('MANIFEST_INVALID');
  }
  return Object.freeze({ rows: Object.freeze(rows), priorityIndex });
}

function normalizePrivateContext(value) {
  if (!exactFields(value, PRIVATE_CONTEXT_FIELDS)
    || typeof value.accountKey !== 'string' || value.accountKey.length === 0
    || value.accountKey.length > 512 || /[\u0000-\u001f\u007f]/.test(value.accountKey)
    || !safeId(value.rootId)
    || !safeId(value.priorityFileId)
    || strictVersion(value.priorityVersion) === null
    || !Number.isSafeInteger(value.generation) || value.generation < 0) {
    fail('PRIVATE_CONTEXT_INVALID');
  }
  return Object.freeze({
    accountKey: value.accountKey,
    rootId: value.rootId,
    priorityFileId: value.priorityFileId,
    priorityVersion: value.priorityVersion,
    generation: value.generation
  });
}

function isAppMediaIdle(state) {
  return state?.selected === null
    && state.mediaAttempt === 'idle'
    && state.mediaAbortController === null
    && state.pendingOriginalBuffer === null
    && state.pendingPlay === false
    && state.mediaTransportStarted === false;
}

function validateRuntime(runtime) {
  let locationUrl;
  let controllerUrl;
  try {
    locationUrl = new URL(runtime.location?.href);
    controllerUrl = new URL(runtime.navigator?.serviceWorker?.controller?.scriptURL);
  } catch {
    fail('RUNTIME_REJECTED');
  }
  const controller = runtime.navigator?.serviceWorker?.controller;
  const state = runtime.state;
  if (runtime.appVersion !== CANDIDATE_VERSION
    || runtime.driveMutationsEnabled !== false
    || typeof runtime.driveFetch !== 'function'
    || typeof runtime.nativeFetch !== 'function'
    || locationUrl.protocol !== 'https:'
    || locationUrl.origin !== CANDIDATE_ORIGIN
    || runtime.top !== runtime.self
    || !controller
    || controller.state !== 'activated'
    || controllerUrl.origin !== CANDIDATE_ORIGIN
    || controllerUrl.pathname !== '/sw.js'
    || controllerUrl.search !== ''
    || controllerUrl.hash !== ''
    || !isPlainObject(state)
    || typeof state.accountId !== 'string'
    || state.accountId.length === 0
    || !Number.isSafeInteger(state.driveSessionGeneration)
    || state.driveSessionGeneration < 0
    || !Number.isSafeInteger(state.mediaSession)
    || state.mediaSession === PROBE_MEDIA_SESSION
    || !isAppMediaIdle(state)) {
    fail('RUNTIME_REJECTED');
  }
  return Object.freeze({
    accountKey: state.accountId,
    generation: state.driveSessionGeneration,
    mediaSession: state.mediaSession,
    controller,
    controllerScriptUrl: controllerUrl.href
  });
}

function safeFailureCode(error, fallback = 'ADAPTER_FAILURE') {
  const code = error instanceof AdapterError || error instanceof BoundedProbeError
    ? error.code
    : fallback;
  return FIXED_FAILURE_CODE_SET.has(code) ? code : fallback;
}

function awaitWithSignal(value, signal) {
  const reason = () => signal.reason instanceof AdapterError || signal.reason instanceof BoundedProbeError
    ? signal.reason : new BoundedProbeError('ABORTED');
  if (signal.aborted) return Promise.reject(reason());
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(result);
    };
    const onAbort = () => finish(reject, reason());
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(value).then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error)
    );
  });
}

function emptyCountAggregate(selectedCount = 0) {
  return Object.freeze({
    selectedCount,
    processedCount: 0,
    stableCount: 0,
    successCount: 0,
    failureCount: 0,
    magicRouteCounts: Object.freeze(zeroCounts(MAGIC_ROUTES)),
    mpegTsOutcomeCounts: Object.freeze(zeroCounts(MPEG_TS_OUTCOMES)),
    videoSignallingCounts: Object.freeze(zeroCounts(SIGNALLING_CATEGORIES)),
    audioSignallingCounts: Object.freeze(zeroCounts(SIGNALLING_CATEGORIES)),
    videoProfileEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    videoFormatEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    audioProfileEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    failureCounts: Object.freeze(zeroCounts(FIXED_FAILURE_CODES)),
    totals: Object.freeze({ requests: 0, receivedBytes: 0, uniqueBytes: 0 })
  });
}

function emptyAggregate(code = null, selectedCount = 0) {
  const failures = zeroCounts(FIXED_FAILURE_CODES);
  if (code) failures[FIXED_FAILURE_CODE_SET.has(code) ? code : 'ADAPTER_FAILURE'] = 1;
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    aggregateAvailable: false,
    complete: false,
    selectedCount,
    processedCount: 0,
    stableCount: 0,
    successCount: 0,
    failureCount: code ? 1 : 0,
    magicRouteCounts: Object.freeze(zeroCounts(MAGIC_ROUTES)),
    mpegTsOutcomeCounts: Object.freeze(zeroCounts(MPEG_TS_OUTCOMES)),
    videoSignallingCounts: Object.freeze(zeroCounts(SIGNALLING_CATEGORIES)),
    audioSignallingCounts: Object.freeze(zeroCounts(SIGNALLING_CATEGORIES)),
    videoProfileEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    videoFormatEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    audioProfileEvidenceCounts: Object.freeze(zeroCounts(PROFILE_EVIDENCE_CATEGORIES)),
    failureCounts: Object.freeze(failures),
    totals: Object.freeze({ requests: 0, receivedBytes: 0, uniqueBytes: 0 }),
    priority: emptyCountAggregate(selectedCount === REPRESENTATIVE_COUNT ? 1 : 0),
    decodePerformed: false,
    playbackPerformed: false,
    mutationPerformed: false,
    persistencePerformed: false,
    nativeFetchUsed: false,
    mediaRelayUsed: false
  });
}

function classifySignalling(streams, kind, targetCodec) {
  const matching = streams.filter((stream) => stream.kind === kind);
  if (matching.length === 0) return 'none';
  const hasTarget = matching.some((stream) => (
    stream.codec === targetCodec || stream.codecFamily === targetCodec
  ));
  const hasOther = matching.some((stream) => (
    stream.codec !== targetCodec && stream.codecFamily !== targetCodec
  ));
  if (hasTarget && hasOther) return 'mixed';
  return hasTarget ? 'target-only' : 'other-only';
}

function classifyVideoProfile(streams) {
  const h264 = streams.filter((stream) => (
    stream.kind === 'video' && (stream.codec === 'h264' || stream.codecFamily === 'h264')
  ));
  if (h264.length === 0) return 'not-applicable';
  const parsed = h264.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.profileIdc === 100 && details.levelIdc === 30
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

function classifyAudioProfile(streams) {
  const aac = streams.filter((stream) => (
    stream.kind === 'audio' && (stream.codec === 'aac' || stream.codecFamily === 'aac')
  ));
  if (aac.length === 0) return 'not-applicable';
  const parsed = aac.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.objectType === 2 && details.sampleRate === 48_000 && details.channels === 2
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

function classifyVideoFormat(streams) {
  const h264 = streams.filter((stream) => (
    stream.kind === 'video' && (stream.codec === 'h264' || stream.codecFamily === 'h264')
  ));
  if (h264.length === 0) return 'not-applicable';
  const parsed = h264.map((stream) => stream.codecDetails)
    .filter((details) => isPlainObject(details) && details.status === 'parsed');
  if (parsed.some((details) => (
    details.width === 360
    && details.height === 640
    && isPlainObject(details.color)
    && details.color.fullRange === false
    && details.color.primaries === 'BT.709'
    && details.color.transfer === 'BT.709'
    && details.color.matrix === 'BT.709'
  ))) return 'target-confirmed';
  return parsed.length > 0 ? 'other-parsed' : 'inconclusive';
}

function summarizeMpegTs(result) {
  if (!isPlainObject(result) || !isPlainObject(result.outcome)
    || !MPEG_TS_OUTCOME_SET.has(result.outcome.code)
    || !Array.isArray(result.programs)) {
    return Object.freeze({
      outcome: 'PARSER_RESULT_INVALID',
      videoSignalling: 'none',
      audioSignalling: 'none',
      videoProfileEvidence: 'not-applicable',
      videoFormatEvidence: 'not-applicable',
      audioProfileEvidence: 'not-applicable'
    });
  }
  const streams = result.programs.flatMap((program) => (
    isPlainObject(program) && Array.isArray(program.streams) ? program.streams : []
  )).filter(isPlainObject);
  const detailEvidence = result.outcome.code === 'MPEG_TS_STRUCTURE_COMPLETE'
    ? streams
    : streams.map((stream) => ({ ...stream, codecDetails: null }));
  return Object.freeze({
    outcome: result.outcome.code,
    videoSignalling: classifySignalling(streams, 'video', 'h264'),
    audioSignalling: classifySignalling(streams, 'audio', 'aac'),
    videoProfileEvidence: classifyVideoProfile(detailEvidence),
    videoFormatEvidence: classifyVideoFormat(detailEvidence),
    audioProfileEvidence: classifyAudioProfile(detailEvidence)
  });
}

function hasRobustMpegTsMagic(bytes) {
  return bytes instanceof Uint8Array
    && bytes.byteLength >= 377
    && bytes[0] === 0x47
    && bytes[188] === 0x47
    && bytes[376] === 0x47;
}

function aggregateResultSet(results, selectedCount) {
  const magic = zeroCounts(MAGIC_ROUTES);
  const outcomes = zeroCounts(MPEG_TS_OUTCOMES);
  const videoSignalling = zeroCounts(SIGNALLING_CATEGORIES);
  const audioSignalling = zeroCounts(SIGNALLING_CATEGORIES);
  const videoProfiles = zeroCounts(PROFILE_EVIDENCE_CATEGORIES);
  const videoFormats = zeroCounts(PROFILE_EVIDENCE_CATEGORIES);
  const audioProfiles = zeroCounts(PROFILE_EVIDENCE_CATEGORIES);
  const failures = zeroCounts(FIXED_FAILURE_CODES);
  let stableCount = 0;
  let successCount = 0;
  let requests = 0;
  let receivedBytes = 0;
  let uniqueBytes = 0;
  for (const result of results) {
    if (result.identity.postflight) stableCount += 1;
    requests += result.metrics.requests;
    receivedBytes += result.metrics.receivedBytes;
    uniqueBytes += result.metrics.uniqueBytes;
    if (!result.ok) {
      const code = FIXED_FAILURE_CODE_SET.has(result.failure?.code)
        ? result.failure.code
        : 'ADAPTER_FAILURE';
      failures[code] += 1;
      continue;
    }
    successCount += 1;
    const kind = MAGIC_ROUTE_SET.has(result.evidence?.kind) ? result.evidence.kind : 'unknown';
    magic[kind] += 1;
    if (kind === 'mpeg-ts') {
      const parsed = result.evidence?.mpegTs;
      const outcome = MPEG_TS_OUTCOME_SET.has(parsed?.outcome)
        ? parsed.outcome
        : 'PARSER_RESULT_INVALID';
      outcomes[outcome] += 1;
      videoSignalling[SIGNALLING_CATEGORIES.includes(parsed?.videoSignalling)
        ? parsed.videoSignalling : 'none'] += 1;
      audioSignalling[SIGNALLING_CATEGORIES.includes(parsed?.audioSignalling)
        ? parsed.audioSignalling : 'none'] += 1;
      videoProfiles[PROFILE_EVIDENCE_CATEGORIES.includes(parsed?.videoProfileEvidence)
        ? parsed.videoProfileEvidence : 'not-applicable'] += 1;
      videoFormats[PROFILE_EVIDENCE_CATEGORIES.includes(parsed?.videoFormatEvidence)
        ? parsed.videoFormatEvidence : 'not-applicable'] += 1;
      audioProfiles[PROFILE_EVIDENCE_CATEGORIES.includes(parsed?.audioProfileEvidence)
        ? parsed.audioProfileEvidence : 'not-applicable'] += 1;
    }
  }
  return Object.freeze({
    selectedCount,
    processedCount: results.length,
    stableCount,
    successCount,
    failureCount: results.length - successCount,
    magicRouteCounts: Object.freeze(magic),
    mpegTsOutcomeCounts: Object.freeze(outcomes),
    videoSignallingCounts: Object.freeze(videoSignalling),
    audioSignallingCounts: Object.freeze(audioSignalling),
    videoProfileEvidenceCounts: Object.freeze(videoProfiles),
    videoFormatEvidenceCounts: Object.freeze(videoFormats),
    audioProfileEvidenceCounts: Object.freeze(audioProfiles),
    failureCounts: Object.freeze(failures),
    totals: Object.freeze({ requests, receivedBytes, uniqueBytes })
  });
}

function aggregateBatch(batch, priorityIndex) {
  const counts = aggregateResultSet(batch.results, REPRESENTATIVE_COUNT);
  const priorityResult = Number.isSafeInteger(priorityIndex) && priorityIndex >= 0
    ? batch.results[priorityIndex]
    : null;
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    aggregateAvailable: true,
    complete: batch.complete === true && batch.processed === REPRESENTATIVE_COUNT,
    ...counts,
    priority: priorityResult
      ? aggregateResultSet([priorityResult], 1)
      : emptyCountAggregate(1),
    decodePerformed: false,
    playbackPerformed: false,
    mutationPerformed: false,
    persistencePerformed: false,
    nativeFetchUsed: counts.totals.requests > 0,
    mediaRelayUsed: false
  });
}

function metadataUrl(fileId) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', DRIVE_FIELDS);
  url.searchParams.set('supportsAllDrives', 'true');
  return url.href;
}

function mediaUrl({ fileId, size, resourceKey, generation }) {
  const url = new URL(`/__drive_media/${encodeURIComponent(fileId)}`, CANDIDATE_ORIGIN);
  url.searchParams.set('accountGeneration', String(generation));
  url.searchParams.set('mediaSession', String(PROBE_MEDIA_SESSION));
  url.searchParams.set('sourceGeneration', String(PROBE_SOURCE_GENERATION));
  url.searchParams.set('size', size);
  if (resourceKey) url.searchParams.set('resourceKey', resourceKey);
  return url.href;
}

function normalizeObservedMetadata(value, expected, expectedResourceKey, priorResourceKey) {
  const allowedFields = new Set([
    'id', 'version', 'size', 'modifiedTime', 'mimeType', 'capabilities', 'trashed', 'resourceKey'
  ]);
  if (!isPlainObject(value) || Object.keys(value).some((key) => !allowedFields.has(key))
    || !isPlainObject(value.capabilities)
    || JSON.stringify(Object.keys(value.capabilities).sort()) !== JSON.stringify(['canDownload'])
    || value.id !== expected.fileId
    || typeof value.version !== 'string'
    || typeof value.size !== 'string'
    || typeof value.modifiedTime !== 'string'
    || typeof value.mimeType !== 'string'
    || typeof value.capabilities.canDownload !== 'boolean'
    || value.trashed !== false
    || (value.resourceKey !== undefined && value.resourceKey !== null
      && (typeof value.resourceKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.resourceKey)))) {
    throw new BoundedProbeError('IDENTITY_MISMATCH');
  }
  const observedResourceKey = value.resourceKey || null;
  if ((expectedResourceKey && observedResourceKey !== expectedResourceKey)
    || (priorResourceKey !== undefined && observedResourceKey !== priorResourceKey)) {
    throw new BoundedProbeError('IDENTITY_MISMATCH');
  }
  return Object.freeze({
    identity: Object.freeze({
      accountKey: expected.accountKey,
      fileId: value.id,
      version: value.version,
      size: value.size,
      modifiedTime: value.modifiedTime,
      mimeType: value.mimeType,
      canDownload: value.capabilities.canDownload
    }),
    resourceKey: observedResourceKey
  });
}

export function createMpegTsBrowserProbe(runtime, dependencies = {}) {
  const inventoryRunner = dependencies.runAuthenticatedRootInventory
    ?? runAuthenticatedRootInventory;
  const representativeSelector = dependencies.selectRiskRepresentatives
    ?? selectRiskRepresentatives;
  const mpegTsParser = dependencies.probeMpegTs ?? probeMpegTs;
  const setTimeoutFn = dependencies.setTimeoutFn ?? globalThis.setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn ?? globalThis.clearTimeout;
  let captured = Object.freeze({
    appVersion: runtime?.appVersion,
    driveFetch: runtime?.driveFetch,
    nativeFetch: runtime?.nativeFetch,
    driveMutationsEnabled: runtime?.driveMutationsEnabled,
    location: runtime?.location,
    navigator: runtime?.navigator,
    self: runtime?.self,
    state: runtime?.state,
    top: runtime?.top,
    addEventListener: runtime?.addEventListener,
    removeEventListener: runtime?.removeEventListener
  });
  const privateContextSource = runtime?.privateContext;
  let privateContext = isPlainObject(privateContextSource)
    ? Object.freeze(Object.fromEntries(
      Object.keys(privateContextSource).map((key) => [key, privateContextSource[key]])
    ))
    : privateContextSource;
  let runClaimed = false;

  async function execute() {
    let owner;
    let context;
    let rowsById = null;
    let selectedCount = 0;
    let nativeFetchUsed = false;
    let requestCount = 0;
    let activeMetadataRequests = 0;
    let runTimer;
    const observedResourceKeys = new Map();
    const lifecycle = new AbortController();
    const abortLifecycle = () => lifecycle.abort(new BoundedProbeError('ABORTED'));
    try {
      owner = validateRuntime(captured);
      context = normalizePrivateContext(privateContext);
      if (context.accountKey !== owner.accountKey || context.generation !== owner.generation) {
        fail('PRIVATE_CONTEXT_INVALID');
      }
      runTimer = setTimeoutFn(
        () => lifecycle.abort(new AdapterError('RUN_TIMEOUT')),
        MAX_RUN_MS
      );

      if (typeof captured.addEventListener === 'function') {
        captured.addEventListener('pagehide', abortLifecycle, { once: true });
        captured.addEventListener('beforeunload', abortLifecycle, { once: true });
      }
      const isGenerationCurrent = (generation) => (
        generation === owner.generation
        && captured.state.driveSessionGeneration === owner.generation
        && captured.state.accountId === owner.accountKey
        && captured.state.mediaSession === owner.mediaSession
        && captured.driveMutationsEnabled === false
        && captured.appVersion === CANDIDATE_VERSION
        && captured.navigator?.serviceWorker?.controller === owner.controller
        && owner.controller.state === 'activated'
        && owner.controller.scriptURL === owner.controllerScriptUrl
        && isAppMediaIdle(captured.state)
      );
      const assertRunOwner = () => {
        if (lifecycle.signal.aborted) throw lifecycle.signal.reason;
        if (!isGenerationCurrent(owner.generation)) {
          throw new BoundedProbeError('GENERATION_STALE');
        }
      };
      const claimRequest = () => {
        assertRunOwner();
        if (activeMetadataRequests !== 0) fail('REQUEST_POLICY_REJECTED');
        if (requestCount >= MAX_DRIVE_REQUESTS) {
          const error = new AdapterError('REQUEST_LIMIT');
          lifecycle.abort(error);
          throw error;
        }
        requestCount += 1;
      };
      const countedDriveFetch = async (urlValue, options = {}) => {
        const url = new URL(urlValue);
        const headers = options.headers instanceof Headers
          ? [...options.headers.entries()] : Object.entries(options.headers || {});
        if (url.origin !== 'https://www.googleapis.com'
          || !url.pathname.startsWith('/drive/v3/')
          || String(options.method || 'GET').toUpperCase() !== 'GET'
          || options.body !== undefined || url.searchParams.has('alt')
          || headers.some(([name]) => name.toLowerCase() !== 'x-goog-drive-resource-keys')) {
          fail('REQUEST_POLICY_REJECTED');
        }
        claimRequest();
        activeMetadataRequests += 1;
        let released = false;
        const release = () => {
          if (released) return;
          released = true;
          activeMetadataRequests -= 1;
        };
        const signal = options.signal ?? lifecycle.signal;
        try {
          const response = await awaitWithSignal(captured.driveFetch(urlValue, {
            ...options, method: 'GET', signal, driveMaxRateAttempts: 1
          }, true, 0), signal);
          assertRunOwner();
          if (!response || response.ok !== true || typeof response.json !== 'function') {
            release();
            return response;
          }
          const readJson = response.json.bind(response);
          let jsonClaimed = false;
          response.json = () => {
            if (jsonClaimed) return Promise.reject(new AdapterError('REQUEST_POLICY_REJECTED'));
            jsonClaimed = true;
            return awaitWithSignal(Promise.resolve().then(() => {
              assertRunOwner();
              return readJson();
            }), signal).then((value) => {
              assertRunOwner();
              return value;
            }).finally(release);
          };
          return response;
        } catch (error) {
          release();
          throw error;
        }
      };

      assertRunOwner();
      let inventory;
      try {
        inventory = await inventoryRunner({
          driveFetch: countedDriveFetch,
          rootId: context.rootId,
          priorityFileId: context.priorityFileId,
          expectedAccountKey: context.accountKey
        });
      } catch (error) {
        assertRunOwner();
        if (error instanceof AdapterError) throw error;
        throw new AdapterError('INVENTORY_FAILED');
      }
      assertRunOwner();
      if (!isPlainObject(inventory) || !isPlainObject(inventory.privatePasses)
        || !isPlainObject(inventory.privatePasses.firstPass)
        || !isPlainObject(inventory.privatePasses.secondPass)) {
        throw new AdapterError('INVENTORY_FAILED');
      }

      let selection;
      try {
        selection = representativeSelector({
          pass: inventory.privatePasses.secondPass,
          priorityFileId: context.priorityFileId,
          expectedPriorityVersion: context.priorityVersion
        });
      } catch {
        throw new AdapterError('SELECTION_FAILED');
      }
      assertRunOwner();
      const normalizedSelection = normalizeManifest(selection?.privateManifest);
      const rows = normalizedSelection.rows;
      selectedCount = rows.length;
      const representatives = rows.map(({ expectedIdentity }) => Object.freeze({
        ...expectedIdentity,
        accountKey: owner.accountKey
      }));
      rowsById = new Map(rows.map((row) => [row.expectedIdentity.fileId, row]));

      const batch = await runBoundedProbeBatch({
        representatives,
        generation: owner.generation,
        isGenerationCurrent,
        signal: lifecycle.signal,
        limits: LIMITS,
        getIdentity: async ({ expectedIdentity, phase, signal }) => {
          if (!isGenerationCurrent(owner.generation)) {
            throw new BoundedProbeError('GENERATION_STALE');
          }
          const row = rowsById.get(expectedIdentity.fileId);
          const headers = row.resourceKey
            ? { 'X-Goog-Drive-Resource-Keys': `${expectedIdentity.fileId}/${row.resourceKey}` }
            : undefined;
          const response = await countedDriveFetch(metadataUrl(expectedIdentity.fileId), {
            method: 'GET',
            signal,
            ...(headers ? { headers } : {})
          });
          if (!response || response.ok !== true || typeof response.json !== 'function') {
            throw new BoundedProbeError(phase === 'postflight' ? 'POSTFLIGHT_FAILED' : 'PREFLIGHT_FAILED');
          }
          const metadata = await response.json();
          if (!isGenerationCurrent(owner.generation)) {
            throw new BoundedProbeError('GENERATION_STALE');
          }
          const priorResourceKey = phase === 'postflight'
            ? observedResourceKeys.get(expectedIdentity.fileId)
            : undefined;
          const observed = normalizeObservedMetadata(
            metadata,
            expectedIdentity,
            row.resourceKey,
            priorResourceKey
          );
          if (phase === 'preflight') {
            observedResourceKeys.set(expectedIdentity.fileId, observed.resourceKey);
          }
          return observed.identity;
        },
        readRange: async ({ identity, range, signal }) => {
          if (!isGenerationCurrent(owner.generation)) {
            throw new BoundedProbeError('GENERATION_STALE');
          }
          const row = rowsById.get(identity.fileId);
          const resourceKey = observedResourceKeys.get(identity.fileId) || row.resourceKey;
          claimRequest();
          nativeFetchUsed = true;
          return captured.nativeFetch(mediaUrl({
            fileId: identity.fileId,
            size: identity.size,
            resourceKey,
            generation: owner.generation
          }), {
            method: 'GET',
            mode: 'same-origin',
            credentials: 'same-origin',
            cache: 'no-store',
            redirect: 'error',
            headers: { Range: range },
            signal
          });
        },
        probe: async ({ read, sniffMagic, planInitialMagicRange }) => {
          const range = planInitialMagicRange(FRONT_BYTES);
          const bytes = await read({ start: range.start, end: range.end });
          const magic = sniffMagic(bytes);
          if (magic.kind !== 'mpeg-ts' || !hasRobustMpegTsMagic(bytes)) {
            return Object.freeze({ kind: magic.kind === 'mpeg-ts' ? 'unknown' : magic.kind });
          }
          let parsed;
          try {
            parsed = summarizeMpegTs(mpegTsParser(bytes, { limits: MPEG_TS_LIMITS }));
          } catch {
            parsed = summarizeMpegTs(null);
          }
          return Object.freeze({ kind: 'mpeg-ts', mpegTs: parsed });
        }
      });
      assertRunOwner();
      return Object.freeze({ ...aggregateBatch(batch, normalizedSelection.priorityIndex), nativeFetchUsed });
    } catch (error) {
      return Object.freeze({ ...emptyAggregate(safeFailureCode(error), selectedCount), nativeFetchUsed });
    } finally {
      lifecycle.abort(new BoundedProbeError('ABORTED'));
      if (runTimer !== undefined) clearTimeoutFn(runTimer);
      observedResourceKeys.clear();
      rowsById?.clear();
      context = null;
      privateContext = null;
      if (typeof captured.removeEventListener === 'function') {
        captured.removeEventListener('pagehide', abortLifecycle);
        captured.removeEventListener('beforeunload', abortLifecycle);
      }
      captured = null;
    }
  }

  function runPrivateMpegTsProbe() {
    if (runClaimed) return Promise.resolve(emptyAggregate('RUN_ALREADY_CLAIMED'));
    runClaimed = true;
    return execute();
  }

  return Object.freeze({ runPrivateMpegTsProbe });
}
