import {
  BoundedProbeError,
  DEFAULT_LIMITS,
  FAILURE_CODES,
  runBoundedProbeBatch
} from './bounded-probe.mjs';
import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { selectRiskRepresentatives } from '../v2-07a-representative-selection/representative-selector.mjs';

const CANDIDATE_ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const CANDIDATE_VERSION = '1.22.0-rc.4';
const MANIFEST_SCHEMA = 'drive-original.v2-07a-risk-selection-private/1';
const OUTPUT_SCHEMA = 'drive-original.v2-07a-front-sniff-aggregate/1';
const REPRESENTATIVE_COUNT = 38;
const FRONT_BYTES = 65_536;
const PROBE_MEDIA_SESSION = Number.MAX_SAFE_INTEGER;
const PROBE_SOURCE_GENERATION = Number.MAX_SAFE_INTEGER;
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
const ADAPTER_FAILURE_CODES = Object.freeze([
  'MANIFEST_INVALID',
  'PRIVATE_CONTEXT_INVALID',
  'RUNTIME_REJECTED',
  'INVENTORY_FAILED',
  'SELECTION_FAILED',
  'RUN_ALREADY_CLAIMED',
  'ADAPTER_FAILURE'
]);
const FIXED_FAILURE_CODES = new Set([...FAILURE_CODES, ...ADAPTER_FAILURE_CODES]);
const MAGIC_KINDS = Object.freeze([
  'iso-bmff', 'mpeg-ts', 'webm', 'matroska', 'ebml', 'avi', 'webp', 'bmp',
  'jpeg', 'png', 'gif', 'error-payload', 'unknown'
]);
const MAGIC_KIND_SET = new Set(MAGIC_KINDS);
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
    super(FIXED_FAILURE_CODES.has(code) ? code : 'ADAPTER_FAILURE');
    this.name = 'AdapterError';
    this.code = FIXED_FAILURE_CODES.has(code) ? code : 'ADAPTER_FAILURE';
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

  const priority = rows.find(({ expectedIdentity }) => (
    expectedIdentity.fileId === value.prioritySample.fileId
  ));
  if (!priority || priority.expectedIdentity.version !== value.prioritySample.version) {
    fail('MANIFEST_INVALID');
  }
  return Object.freeze(rows);
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
  return FIXED_FAILURE_CODES.has(code) ? code : fallback;
}

function aggregateFailure(code) {
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    complete: false,
    expectedCount: REPRESENTATIVE_COUNT,
    processedCount: 0,
    preflightPassedCount: 0,
    postflightPassedCount: 0,
    successCount: 0,
    failureCount: 1,
    magicCounts: Object.freeze({}),
    failureCounts: Object.freeze({ [FIXED_FAILURE_CODES.has(code) ? code : 'ADAPTER_FAILURE']: 1 }),
    totals: Object.freeze({ requests: 0, receivedBytes: 0, uniqueBytes: 0 }),
    decodeClaimed: false,
    playbackClaimed: false
  });
}

function aggregateBatch(batch) {
  const magicCounts = {};
  const failureCounts = {};
  let preflightPassedCount = 0;
  let postflightPassedCount = 0;
  let successCount = 0;
  let requests = 0;
  let receivedBytes = 0;
  let uniqueBytes = 0;
  for (const result of batch.results) {
    if (result.identity.preflight) preflightPassedCount += 1;
    if (result.identity.postflight) postflightPassedCount += 1;
    requests += result.metrics.requests;
    receivedBytes += result.metrics.receivedBytes;
    uniqueBytes += result.metrics.uniqueBytes;
    if (result.ok) {
      successCount += 1;
      const kind = MAGIC_KIND_SET.has(result.evidence?.kind) ? result.evidence.kind : 'unknown';
      magicCounts[kind] = (magicCounts[kind] || 0) + 1;
    } else {
      const code = FIXED_FAILURE_CODES.has(result.failure?.code)
        ? result.failure.code
        : 'ADAPTER_FAILURE';
      failureCounts[code] = (failureCounts[code] || 0) + 1;
    }
  }
  const orderedMagic = Object.fromEntries(MAGIC_KINDS
    .filter((kind) => magicCounts[kind])
    .map((kind) => [kind, magicCounts[kind]]));
  const orderedFailures = Object.fromEntries([...FIXED_FAILURE_CODES]
    .filter((code) => failureCounts[code])
    .map((code) => [code, failureCounts[code]]));
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    complete: batch.complete === true && batch.processed === REPRESENTATIVE_COUNT,
    expectedCount: REPRESENTATIVE_COUNT,
    processedCount: batch.processed,
    preflightPassedCount,
    postflightPassedCount,
    successCount,
    failureCount: batch.processed - successCount,
    magicCounts: Object.freeze(orderedMagic),
    failureCounts: Object.freeze(orderedFailures),
    totals: Object.freeze({ requests, receivedBytes, uniqueBytes }),
    decodeClaimed: false,
    playbackClaimed: false
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

export function createDriveBrowserAdapter(runtime, dependencies = {}) {
  const inventoryRunner = dependencies.runAuthenticatedRootInventory
    ?? runAuthenticatedRootInventory;
  const representativeSelector = dependencies.selectRiskRepresentatives
    ?? selectRiskRepresentatives;
  const captured = Object.freeze({
    appVersion: runtime?.appVersion,
    driveFetch: runtime?.driveFetch,
    driveMutationsEnabled: runtime?.driveMutationsEnabled,
    location: runtime?.location,
    nativeFetch: runtime?.nativeFetch,
    navigator: runtime?.navigator,
    self: runtime?.self,
    state: runtime?.state,
    top: runtime?.top,
    addEventListener: runtime?.addEventListener,
    removeEventListener: runtime?.removeEventListener
  });
  const privateContextSource = runtime?.privateContext;
  const privateContext = isPlainObject(privateContextSource)
    ? Object.freeze(Object.fromEntries(
      Object.keys(privateContextSource).map((key) => [key, privateContextSource[key]])
    ))
    : privateContextSource;
  let runClaimed = false;

  async function executePrivateFrontSniff() {
    let owner;
    let context;
    try {
      owner = validateRuntime(captured);
      context = normalizePrivateContext(privateContext);
      if (context.accountKey !== owner.accountKey || context.generation !== owner.generation) {
        fail('PRIVATE_CONTEXT_INVALID');
      }
    } catch (error) {
      return aggregateFailure(safeFailureCode(error));
    }

    const observedResourceKeys = new Map();
    const lifecycle = new AbortController();
    const abortLifecycle = () => lifecycle.abort(new BoundedProbeError('ABORTED'));
    if (typeof captured.addEventListener === 'function') {
      captured.addEventListener('pagehide', abortLifecycle, { once: true });
      captured.addEventListener('beforeunload', abortLifecycle, { once: true });
    }
    const isGenerationCurrent = (generation) => (
      generation === owner.generation
      && captured.state.driveSessionGeneration === owner.generation
      && captured.state.accountId === owner.accountKey
      && captured.state.mediaSession === owner.mediaSession
      && captured.state.mediaSession !== PROBE_MEDIA_SESSION
      && captured.driveMutationsEnabled === false
      && captured.appVersion === CANDIDATE_VERSION
      && captured.navigator?.serviceWorker?.controller === owner.controller
      && owner.controller.state === 'activated'
      && owner.controller.scriptURL === owner.controllerScriptUrl
      // This proves only that the app owns no active player/media operation.
      // The one-shot probe identifiers fence its SW messages; unrelated SW work
      // cannot be enumerated from this page and is not claimed absent here.
      && isAppMediaIdle(captured.state)
    );
    const assertRunOwner = () => {
      if (lifecycle.signal.aborted) throw new BoundedProbeError('ABORTED');
      if (!isGenerationCurrent(owner.generation)) {
        throw new BoundedProbeError('GENERATION_STALE');
      }
    };

    try {
      assertRunOwner();
      let inventory;
      try {
        inventory = await inventoryRunner({
          driveFetch: async (url, options = {}) => {
            assertRunOwner();
            const response = await captured.driveFetch(url, {
              ...options,
              signal: lifecycle.signal
            });
            assertRunOwner();
            return response;
          },
          rootId: context.rootId,
          priorityFileId: context.priorityFileId,
          expectedAccountKey: context.accountKey
        });
      } catch (error) {
        assertRunOwner();
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
      const rows = normalizeManifest(selection?.privateManifest);
      const representatives = rows.map(({ expectedIdentity }) => Object.freeze({
        ...expectedIdentity,
        accountKey: owner.accountKey
      }));
      const rowsById = new Map(rows.map((row) => [row.expectedIdentity.fileId, row]));

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
          const response = await captured.driveFetch(metadataUrl(expectedIdentity.fileId), {
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
          return sniffMagic(bytes);
        }
      });
      assertRunOwner();
      return aggregateBatch(batch);
    } catch (error) {
      return aggregateFailure(safeFailureCode(error));
    } finally {
      lifecycle.abort(new BoundedProbeError('ABORTED'));
      observedResourceKeys.clear();
      if (typeof captured.removeEventListener === 'function') {
        captured.removeEventListener('pagehide', abortLifecycle);
        captured.removeEventListener('beforeunload', abortLifecycle);
      }
    }
  }

  function runPrivateFrontSniff() {
    if (runClaimed) return Promise.resolve(aggregateFailure('RUN_ALREADY_CLAIMED'));
    runClaimed = true;
    return executePrivateFrontSniff();
  }

  return Object.freeze({ runPrivateFrontSniff });
}
