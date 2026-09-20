import { runAuthenticatedRootInventory } from '../v2-07a-root-inventory/drive-browser-adapter.mjs';
import { selectRiskRepresentatives } from '../v2-07a-representative-selection/representative-selector.mjs';

const CANDIDATE_ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const CANDIDATE_VERSION = '1.22.0-rc.4';
const MANIFEST_SCHEMA = 'drive-original.v2-07a-risk-selection-private/1';
const OUTPUT_SCHEMA = 'drive-original.v2-07a-identity-reconciliation-aggregate/1';
const REPRESENTATIVE_COUNT = 38;
// The known two-pass corpus path is about 138 requests and remains below 200
// even if each pass consumes its one allowed page-token restart.
const MAX_DRIVE_REQUESTS = 512;
const MAX_RECONCILIATION_REQUESTS = REPRESENTATIVE_COUNT * 2;
const MAX_RUN_MS = 10 * 60 * 1000;
const DRIVE_FIELDS = 'id,version,size,modifiedTime,mimeType,capabilities(canDownload),trashed,resourceKey';
const DIMENSIONS = Object.freeze([
  'fileId', 'version', 'size', 'modifiedTime', 'mimeType', 'canDownload',
  'trashed', 'resourceKeyPresence'
]);
const FAILURE_CODES = Object.freeze([
  'RUNTIME_REJECTED', 'PRIVATE_CONTEXT_INVALID', 'INVENTORY_FAILED',
  'SELECTION_FAILED', 'MANIFEST_INVALID', 'METADATA_READ_FAILED',
  'INVALID_METADATA', 'REQUEST_POLICY_REJECTED', 'REQUEST_LIMIT',
  'TIME_LIMIT', 'LIFECYCLE_ABORTED', 'OWNERSHIP_LOST',
  'RUN_ALREADY_CLAIMED', 'RECONCILIATION_FAILED'
]);
const FAILURE_CODE_SET = new Set(FAILURE_CODES);
const TOP_LEVEL_FIELDS = Object.freeze(['prioritySample', 'schema', 'selected']);
const PRIORITY_FIELDS = Object.freeze(['fileId', 'version']);
const ROW_FIELDS = Object.freeze([
  'coveredCategories', 'extension', 'fileId', 'mandatoryReasons', 'mimeType',
  'modifiedTime', 'size', 'version', 'visibleReferences'
]);
const REFERENCE_FIELDS = Object.freeze(['fileId', 'resourceKey']);
const PRIVATE_CONTEXT_FIELDS = Object.freeze([
  'accountKey', 'generation', 'priorityFileId', 'priorityVersion', 'rootId'
]);

class ReconciliationError extends Error {
  constructor(code) {
    super(FAILURE_CODE_SET.has(code) ? code : 'RECONCILIATION_FAILED');
    this.name = 'ReconciliationError';
    this.code = FAILURE_CODE_SET.has(code) ? code : 'RECONCILIATION_FAILED';
  }
}

function fail(code) {
  throw new ReconciliationError(code);
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
  return value === null || (typeof value === 'string' && value.length > 0
    && value.length <= maximum && !/[\u0000-\u001f\u007f]/.test(value));
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

function normalizePrivateContext(value) {
  if (!exactFields(value, PRIVATE_CONTEXT_FIELDS)
    || typeof value.accountKey !== 'string' || value.accountKey.length === 0
    || value.accountKey.length > 512 || /[\u0000-\u001f\u007f]/.test(value.accountKey)
    || !safeId(value.rootId) || !safeId(value.priorityFileId)
    || typeof value.priorityVersion !== 'string'
    || !/^(0|[1-9]\d*)$/.test(value.priorityVersion)
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

function normalizeManifest(value) {
  if (!exactFields(value, TOP_LEVEL_FIELDS) || value.schema !== MANIFEST_SCHEMA
    || !exactFields(value.prioritySample, PRIORITY_FIELDS)
    || !safeId(value.prioritySample.fileId)
    || typeof value.prioritySample.version !== 'string'
    || !/^(0|[1-9]\d*)$/.test(value.prioritySample.version)
    || !Array.isArray(value.selected) || value.selected.length !== REPRESENTATIVE_COUNT) {
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
    const resourceKeys = new Set();
    const references = new Set();
    for (const reference of row.visibleReferences) {
      if (!exactFields(reference, REFERENCE_FIELDS) || !safeId(reference.fileId)
        || (reference.resourceKey !== null
          && (typeof reference.resourceKey !== 'string'
            || reference.resourceKey.length > 512
            || !/^[A-Za-z0-9_-]+$/.test(reference.resourceKey)))) {
        fail('MANIFEST_INVALID');
      }
      const key = `${reference.fileId}\u0000${reference.resourceKey ?? ''}`;
      if (references.has(key)) fail('MANIFEST_INVALID');
      references.add(key);
      if (reference.resourceKey !== null) resourceKeys.add(reference.resourceKey);
    }
    if (resourceKeys.size > 1) fail('MANIFEST_INVALID');
    return Object.freeze({
      expected: Object.freeze({
        fileId: row.fileId,
        version: row.version,
        size: row.size,
        modifiedTime: row.modifiedTime,
        mimeType: row.mimeType,
        canDownload: true,
        trashed: false,
        resourceKeyPresence: resourceKeys.size === 1
      }),
      resourceKey: resourceKeys.size === 1 ? [...resourceKeys][0] : null
    });
  });
  const priority = rows.find(({ expected }) => expected.fileId === value.prioritySample.fileId);
  if (!priority || priority.expected.version !== value.prioritySample.version) {
    fail('MANIFEST_INVALID');
  }
  return Object.freeze(rows);
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
    || locationUrl.protocol !== 'https:' || locationUrl.origin !== CANDIDATE_ORIGIN
    || runtime.top !== runtime.self || !controller || controller.state !== 'activated'
    || controllerUrl.origin !== CANDIDATE_ORIGIN || controllerUrl.pathname !== '/sw.js'
    || controllerUrl.search !== '' || controllerUrl.hash !== ''
    || !isPlainObject(state) || typeof state.accountId !== 'string' || !state.accountId
    || !Number.isSafeInteger(state.driveSessionGeneration) || state.driveSessionGeneration < 0
    || !Number.isSafeInteger(state.mediaSession) || !isAppMediaIdle(state)) {
    fail('RUNTIME_REJECTED');
  }
  return Object.freeze({
    accountKey: state.accountId,
    generation: state.driveSessionGeneration,
    mediaSession: state.mediaSession,
    controller,
    controllerScriptUrl: controller.scriptURL
  });
}

function emptyDimensionCounts() {
  return Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, 0]));
}

function emptyAggregate(code = null) {
  return Object.freeze({
    schema: OUTPUT_SCHEMA,
    complete: false,
    selectedCount: REPRESENTATIVE_COUNT,
    processedCount: 0,
    preflightReadCount: 0,
    postflightReadCount: 0,
    stableIdentityCount: 0,
    mismatchedIdentityCount: 0,
    unresolvedIdentityCount: REPRESENTATIVE_COUNT,
    expectedMismatchCounts: Object.freeze(emptyDimensionCounts()),
    prePostDriftCounts: Object.freeze(emptyDimensionCounts()),
    failureCounts: Object.freeze(code ? { [code]: 1 } : {}),
    totals: Object.freeze({ driveMetadataRequests: 0, reconciliationMetadataRequests: 0 }),
    mediaBodiesRead: 0,
    decodeClaimed: false,
    playbackClaimed: false
  });
}

function fixedCode(error, fallback = 'RECONCILIATION_FAILED') {
  return error instanceof ReconciliationError && FAILURE_CODE_SET.has(error.code)
    ? error.code
    : fallback;
}

function abortCode(signal) {
  return signal.reason instanceof ReconciliationError
    ? signal.reason
    : new ReconciliationError('LIFECYCLE_ABORTED');
}

function throwIfAborted(signal) {
  if (signal.aborted) throw abortCode(signal);
}

function awaitWithSignal(value, signal) {
  throwIfAborted(signal);
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback, result) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener('abort', onAbort);
      callback(result);
    };
    const onAbort = () => finish(reject, abortCode(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) onAbort();
    Promise.resolve(value).then(
      (result) => finish(resolve, result),
      (error) => finish(reject, error)
    );
  });
}

function requestHeaders(options) {
  if (options?.headers instanceof Headers) return [...options.headers.entries()];
  return Object.entries(options?.headers || {}).map(([key, value]) => [key, String(value)]);
}

function assertMetadataRequest(urlValue, options) {
  let url;
  try { url = new URL(urlValue); } catch { fail('REQUEST_POLICY_REJECTED'); }
  const method = String(options?.method || 'GET').toUpperCase();
  const headers = requestHeaders(options);
  if (url.origin !== 'https://www.googleapis.com'
    || !url.pathname.startsWith('/drive/v3/')
    || method !== 'GET' || options?.body !== undefined
    || url.searchParams.has('alt')
    || headers.some(([name]) => name.toLowerCase() === 'range')
    || headers.some(([name]) => name.toLowerCase() !== 'x-goog-drive-resource-keys')) {
    fail('REQUEST_POLICY_REJECTED');
  }
}

function metadataUrl(fileId) {
  const url = new URL(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set('fields', DRIVE_FIELDS);
  url.searchParams.set('supportsAllDrives', 'true');
  return url.href;
}

function observedSnapshot(value) {
  const allowed = new Set([
    'id', 'version', 'size', 'modifiedTime', 'mimeType', 'capabilities', 'trashed', 'resourceKey'
  ]);
  if (!isPlainObject(value) || Object.keys(value).some((key) => !allowed.has(key))
    || !safeId(value.id) || typeof value.version !== 'string'
    || !/^(0|[1-9]\d*)$/.test(value.version)
    || typeof value.size !== 'string' || !/^(0|[1-9]\d*)$/.test(value.size)
    || typeof value.modifiedTime !== 'string' || typeof value.mimeType !== 'string'
    || !isPlainObject(value.capabilities)
    || JSON.stringify(Object.keys(value.capabilities).sort()) !== JSON.stringify(['canDownload'])
    || typeof value.capabilities.canDownload !== 'boolean'
    || typeof value.trashed !== 'boolean'
    || (value.resourceKey !== undefined && value.resourceKey !== null
      && (typeof value.resourceKey !== 'string' || !/^[A-Za-z0-9_-]+$/.test(value.resourceKey)))) {
    fail('INVALID_METADATA');
  }
  return Object.freeze({
    fileId: value.id,
    version: value.version,
    size: value.size,
    modifiedTime: value.modifiedTime,
    mimeType: value.mimeType,
    canDownload: value.capabilities.canDownload,
    trashed: value.trashed,
    resourceKeyPresence: typeof value.resourceKey === 'string' && value.resourceKey.length > 0
  });
}

function compareDimensions(left, right) {
  return DIMENSIONS.filter((dimension) => left[dimension] !== right[dimension]);
}

export function createDriveIdentityReconciliation(runtime, dependencies = {}) {
  const inventoryRunner = dependencies.runAuthenticatedRootInventory
    ?? runAuthenticatedRootInventory;
  const representativeSelector = dependencies.selectRiskRepresentatives
    ?? selectRiskRepresentatives;
  const setTimeoutFn = dependencies.setTimeoutFn ?? globalThis.setTimeout;
  const clearTimeoutFn = dependencies.clearTimeoutFn ?? globalThis.clearTimeout;
  const captured = Object.freeze({
    appVersion: runtime?.appVersion,
    driveFetch: runtime?.driveFetch,
    driveMutationsEnabled: runtime?.driveMutationsEnabled,
    state: runtime?.state,
    location: runtime?.location,
    navigator: runtime?.navigator,
    top: runtime?.top,
    self: runtime?.self,
    addEventListener: runtime?.addEventListener,
    removeEventListener: runtime?.removeEventListener
  });
  const contextSource = runtime?.privateContext;
  const privateContext = isPlainObject(contextSource)
    ? Object.freeze(Object.fromEntries(Object.keys(contextSource).map((key) => [key, contextSource[key]])))
    : contextSource;
  let claimed = false;

  async function execute() {
    let owner;
    let context;
    try {
      owner = validateRuntime(captured);
      context = normalizePrivateContext(privateContext);
      if (context.accountKey !== owner.accountKey || context.generation !== owner.generation) {
        fail('PRIVATE_CONTEXT_INVALID');
      }
    } catch (error) {
      return emptyAggregate(fixedCode(error));
    }

    const controller = new AbortController();
    const abortLifecycle = () => controller.abort(new ReconciliationError('LIFECYCLE_ABORTED'));
    if (typeof captured.addEventListener === 'function') {
      captured.addEventListener('pagehide', abortLifecycle, { once: true });
      captured.addEventListener('beforeunload', abortLifecycle, { once: true });
    }
    const timer = setTimeoutFn(
      () => controller.abort(new ReconciliationError('TIME_LIMIT')),
      MAX_RUN_MS
    );
    let driveMetadataRequests = 0;
    let reconciliationMetadataRequests = 0;
    let activeRequests = 0;

    const current = () => captured.state.accountId === owner.accountKey
      && captured.state.driveSessionGeneration === owner.generation
      && captured.state.mediaSession === owner.mediaSession
      && captured.driveMutationsEnabled === false
      && captured.appVersion === CANDIDATE_VERSION
      && captured.navigator?.serviceWorker?.controller === owner.controller
      && owner.controller.state === 'activated'
      && owner.controller.scriptURL === owner.controllerScriptUrl
      && isAppMediaIdle(captured.state);
    const assertOwner = () => {
      throwIfAborted(controller.signal);
      if (!current()) fail('OWNERSHIP_LOST');
    };
    const countedDriveFetch = async (url, options = {}) => {
      assertOwner();
      assertMetadataRequest(url, options);
      if (activeRequests !== 0) fail('REQUEST_POLICY_REJECTED');
      if (driveMetadataRequests >= MAX_DRIVE_REQUESTS) fail('REQUEST_LIMIT');
      activeRequests += 1;
      driveMetadataRequests += 1;
      let released = false;
      const release = () => {
        if (released) return;
        released = true;
        activeRequests -= 1;
      };
      try {
        const response = await awaitWithSignal(captured.driveFetch(url, {
          ...options,
          method: 'GET',
          signal: controller.signal
        }), controller.signal);
        assertOwner();
        if (!response || response.ok !== true || typeof response.json !== 'function') {
          release();
          return response;
        }
        const readJson = response.json.bind(response);
        let jsonClaimed = false;
        response.json = () => {
          if (jsonClaimed) return Promise.reject(new ReconciliationError('REQUEST_POLICY_REJECTED'));
          jsonClaimed = true;
          return awaitWithSignal(Promise.resolve().then(() => readJson()), controller.signal)
            .finally(release);
        };
        return response;
      } catch (error) {
        release();
        throw error;
      }
    };

    try {
      assertOwner();
      let inventory;
      try {
        inventory = await inventoryRunner({
          driveFetch: countedDriveFetch,
          rootId: context.rootId,
          priorityFileId: context.priorityFileId,
          expectedAccountKey: context.accountKey
        });
      } catch (error) {
        assertOwner();
        if (error instanceof ReconciliationError) throw error;
        fail('INVENTORY_FAILED');
      }
      assertOwner();
      if (!isPlainObject(inventory?.privatePasses?.firstPass)
        || !isPlainObject(inventory?.privatePasses?.secondPass)) fail('INVENTORY_FAILED');

      let selection;
      try {
        selection = representativeSelector({
          pass: inventory.privatePasses.secondPass,
          priorityFileId: context.priorityFileId,
          expectedPriorityVersion: context.priorityVersion
        });
      } catch {
        fail('SELECTION_FAILED');
      }
      assertOwner();
      const rows = normalizeManifest(selection?.privateManifest);
      const pre = new Array(REPRESENTATIVE_COUNT).fill(null);
      const post = new Array(REPRESENTATIVE_COUNT).fill(null);
      const failureCounts = {};
      let preflightReadCount = 0;
      let postflightReadCount = 0;

      const readOne = async (row) => {
        if (reconciliationMetadataRequests >= MAX_RECONCILIATION_REQUESTS) fail('REQUEST_LIMIT');
        reconciliationMetadataRequests += 1;
        const headers = row.resourceKey
          ? { 'X-Goog-Drive-Resource-Keys': `${row.expected.fileId}/${row.resourceKey}` }
          : undefined;
        try {
          const response = await countedDriveFetch(metadataUrl(row.expected.fileId), {
            ...(headers ? { headers } : {})
          });
          if (!response || response.ok !== true || typeof response.json !== 'function') {
            fail('METADATA_READ_FAILED');
          }
          return observedSnapshot(await response.json());
        } catch (error) {
          assertOwner();
          if (error instanceof ReconciliationError
            && !['METADATA_READ_FAILED', 'INVALID_METADATA'].includes(error.code)) throw error;
          const code = fixedCode(error, 'METADATA_READ_FAILED');
          failureCounts[code] = (failureCounts[code] || 0) + 1;
          return null;
        }
      };

      for (let index = 0; index < rows.length; index += 1) {
        pre[index] = await readOne(rows[index]);
        if (pre[index]) preflightReadCount += 1;
      }
      assertOwner();
      for (let index = 0; index < rows.length; index += 1) {
        post[index] = await readOne(rows[index]);
        if (post[index]) postflightReadCount += 1;
      }
      assertOwner();

      const mismatchSets = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, new Set()]));
      const driftSets = Object.fromEntries(DIMENSIONS.map((dimension) => [dimension, new Set()]));
      const mismatchedRows = new Set();
      let pairedReadCount = 0;
      let stableIdentityCount = 0;
      for (let index = 0; index < rows.length; index += 1) {
        if (!pre[index] || !post[index]) continue;
        pairedReadCount += 1;
        const expectedMismatch = new Set([
          ...compareDimensions(rows[index].expected, pre[index]),
          ...compareDimensions(rows[index].expected, post[index])
        ]);
        const drift = compareDimensions(pre[index], post[index]);
        for (const dimension of expectedMismatch) {
          mismatchSets[dimension].add(index);
          mismatchedRows.add(index);
        }
        for (const dimension of drift) {
          driftSets[dimension].add(index);
          mismatchedRows.add(index);
        }
        if (expectedMismatch.size === 0 && drift.length === 0) stableIdentityCount += 1;
      }
      assertOwner();
      const unresolvedIdentityCount = REPRESENTATIVE_COUNT - pairedReadCount;
      return Object.freeze({
        schema: OUTPUT_SCHEMA,
        complete: unresolvedIdentityCount === 0,
        selectedCount: REPRESENTATIVE_COUNT,
        processedCount: pairedReadCount,
        preflightReadCount,
        postflightReadCount,
        stableIdentityCount,
        mismatchedIdentityCount: mismatchedRows.size,
        unresolvedIdentityCount,
        expectedMismatchCounts: Object.freeze(Object.fromEntries(
          DIMENSIONS.map((dimension) => [dimension, mismatchSets[dimension].size])
        )),
        prePostDriftCounts: Object.freeze(Object.fromEntries(
          DIMENSIONS.map((dimension) => [dimension, driftSets[dimension].size])
        )),
        failureCounts: Object.freeze(Object.fromEntries(
          Object.entries(failureCounts).sort(([left], [right]) => left.localeCompare(right))
        )),
        totals: Object.freeze({ driveMetadataRequests, reconciliationMetadataRequests }),
        mediaBodiesRead: 0,
        decodeClaimed: false,
        playbackClaimed: false
      });
    } catch (error) {
      return emptyAggregate(fixedCode(error));
    } finally {
      controller.abort(new ReconciliationError('LIFECYCLE_ABORTED'));
      clearTimeoutFn(timer);
      if (typeof captured.removeEventListener === 'function') {
        captured.removeEventListener('pagehide', abortLifecycle);
        captured.removeEventListener('beforeunload', abortLifecycle);
      }
    }
  }

  function runPrivateIdentityReconciliation() {
    if (claimed) return Promise.resolve(emptyAggregate('RUN_ALREADY_CLAIMED'));
    claimed = true;
    return execute();
  }

  return Object.freeze({ runPrivateIdentityReconciliation });
}
