import { collectSnapshot, compareSnapshots, canonical, SnapshotError } from './snapshot.mjs';

const ORIGIN = 'https://drive-original-v2-candidate.drive-original-cloudflare-candidate.workers.dev';
const error = code => { throw new SnapshotError(code); };
const failures = new Set(['invalid_contract', 'invalid_limits', 'invalid_clock', 'time_limit', 'cancelled',
  'stale_owner', 'request_limit', 'read_failed', 'missing_file', 'invalid_reader', 'byte_limit',
  'invalid_json', 'invalid_account', 'account_mismatch', 'page_limit', 'malformed_catalog',
  'incomplete_catalog', 'unexpected_file', 'duplicate_file', 'duplicate_writer', 'file_limit',
  'repeated_page', 'empty_snapshot', 'concurrent_change', 'malformed_state', 'unsupported_schema',
  'malformed_snapshot', 'snapshot_state_mismatch', 'empty_contract_mismatch', 'empty_baseline',
  'local_account_mismatch', 'candidate_required', 'account_not_ready', 'media_busy',
  'request_policy', 'invalid_local_replica', 'run_already_claimed']);

// One run owns its private snapshots. It returns only fixed codes and aggregates.
// Repeated same-origin reads are not evidence of legacy-origin local-cache transfer.
export function createBrowserStateAudit(context, { milliseconds = 30_000 } = {}) {
  let claimed = false;
  return Object.freeze({ async run() {
    const base = { scope: 'Repeated candidate remote reads and current runtime projection only',
      passed: false, writeAuthorization: false, legacyLocalReplicaVerified: false, deviceVerified: false };
    if (claimed) return { ...base, failure: 'run_already_claimed' };
    claimed = true;
    const controller = new AbortController();
    let timer, timedOut = false;
    const abort = () => controller.abort();
    try {
      const { state, appVersion, expectedVersion, mutationsEnabled, readDriveResponse, credentialUsable, normalize, merge,
        location, navigator, document, mediaIdle, readLocalReplica, addEventListener, removeEventListener } = context || {};
      if (typeof readDriveResponse !== 'function' || typeof credentialUsable !== 'function'
        || typeof normalize !== 'function' || typeof merge !== 'function'
        || typeof mediaIdle !== 'function' || typeof readLocalReplica !== 'function'
        || typeof addEventListener !== 'function' || typeof removeEventListener !== 'function') error('invalid_contract');
      if (!Number.isSafeInteger(milliseconds) || milliseconds < 1 || milliseconds > 30_000) error('invalid_limits');
      if (location?.origin !== ORIGIN || !expectedVersion || appVersion !== expectedVersion
        || mutationsEnabled !== false || !navigator?.serviceWorker?.controller) error('candidate_required');
      if (!state?.accountId || !state.authAccountKey || state.demo || !state.accountStateLoaded
        || state.accountIdentityPending || !state.token || !credentialUsable() || navigator.onLine === false
        || document?.visibilityState !== 'visible') error('account_not_ready');
      if (!mediaIdle() || state.accountStateLoadingPromise || state.accountStateSyncPromise) error('media_busy');
      const owner = { accountId: state.accountId, authAccountKey: state.authAccountKey,
        authGeneration: state.authGeneration, driveSessionGeneration: state.driveSessionGeneration,
        controller: navigator.serviceWorker.controller, projection: canonical(normalize(state.accountMediaState)) };
      const current = () => !controller.signal.aborted && state.accountId === owner.accountId
        && state.authAccountKey === owner.authAccountKey && state.authGeneration === owner.authGeneration
        && state.driveSessionGeneration === owner.driveSessionGeneration && !state.accountIdentityPending
        && state.accountStateLoaded && !state.accountStateLoadingPromise && !state.accountStateSyncPromise
        && canonical(normalize(state.accountMediaState)) === owner.projection
        && navigator.serviceWorker.controller === owner.controller && navigator.onLine !== false
        && document.visibilityState === 'visible' && mediaIdle();
      const localReplica = readLocalReplica();
      const localSignature = canonical(localReplica);
      const started = Date.now();
      timer = setTimeout(() => { timedOut = true; abort(); }, milliseconds);
      addEventListener('pagehide', abort); addEventListener('beforeunload', abort);
      const read = (address, options) => {
        if (!current()) error('stale_owner');
        if (!credentialUsable()) error('account_not_ready');
        const url = new URL(address);
        const keys = [...url.searchParams.keys()].sort();
        const permitted = url.origin === 'https://www.googleapis.com' && !url.hash && !url.username && !url.password
          && options?.method === 'GET' && !options.headers && !options.body
          && ((url.pathname === '/drive/v3/about' && keys.join(',') === 'fields'
            && url.searchParams.get('fields') === 'user(permissionId)')
          || (url.pathname === '/drive/v3/files' && url.searchParams.get('spaces') === 'appDataFolder'
            && keys.every(key => ['spaces', 'pageSize', 'q', 'fields', 'pageToken'].includes(key)))
          || (/^\/drive\/v3\/files\/[A-Za-z0-9_-]+$/.test(url.pathname)
            && keys.join(',') === 'alt' && url.searchParams.get('alt') === 'media'));
        if (!permitted) error('request_policy');
        return readDriveResponse(address, { method: 'GET', signal: options.signal });
      };
      const used = { requests: 0, bytes: 0 };
      const capture = async () => {
        if (used.requests >= 100) error('request_limit');
        if (used.bytes >= 8 * 1024 * 1024) error('byte_limit');
        if (Date.now() - started >= milliseconds) error('time_limit');
        const result = await collectSnapshot({ read, normalize, merge, expectedAccountId: owner.accountId,
          isCurrent: current, signal: controller.signal, limits: { requests: 100 - used.requests,
            bytes: 8 * 1024 * 1024 - used.bytes, milliseconds: milliseconds - (Date.now() - started) } });
        used.requests += result.capture.requests; used.bytes += result.capture.bytes;
        return result;
      };
      const before = await capture();
      const after = await capture();
      if (!current() || canonical(readLocalReplica()) !== localSignature) error('stale_owner');
      const comparison = compareSnapshots(before, after, { normalize, merge,
        localReplica, localReplicaAccountId: localReplica === null ? null : owner.accountId });
      const reconstruction = comparison.local?.reconstruction || normalize(after.remote);
      const runtimeReconstructionMatches = canonical(reconstruction) === owner.projection;
      if (Date.now() - started >= milliseconds) error('time_limit');
      if (!current() || canonical(readLocalReplica()) !== localSignature) error('stale_owner');
      return { ...base, passed: comparison.comparisonSummary.remoteEquivalent && runtimeReconstructionMatches,
        comparison: comparison.comparisonSummary, runtimeReconstructionMatches,
        candidateLocalReplicaRead: localReplica !== null,
        capture: { requests: before.capture.requests + after.capture.requests,
          bytes: before.capture.bytes + after.capture.bytes, retries: before.capture.retries + after.capture.retries } };
    } catch (cause) {
      const code = timedOut ? 'time_limit'
        : cause instanceof SnapshotError && failures.has(cause.code) ? cause.code : 'read_failed';
      return { ...base, failure: code };
    } finally {
      clearTimeout(timer); controller.abort();
      if (typeof context?.removeEventListener === 'function') {
        context.removeEventListener('pagehide', abort);
        context.removeEventListener('beforeunload', abort);
      }
    }
  } });
}
