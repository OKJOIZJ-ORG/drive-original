import { canonical, collectSnapshot, compareSnapshots } from '../v2-state-snapshot/snapshot.mjs';
import { createRecoveryBackup, safeBackupFailure } from '../v2-state-recovery-backup/backup.mjs';

const PREFIX = 'drive-original-account-state-v2-';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,modifiedTime';
const known = new Set(['stale_owner', 'cancelled', 'invalid_contract', 'backup_mismatch',
  'candidate_changed', 'own_writer_exists', 'write_policy', 'already_claimed', 'journal_failed',
  'submission_uncertain', 'readback_mismatch', 'time_limit', 'lock_required', 'not_run']);
const fail = code => { throw Object.assign(new Error(code), { code }); };
const copy = value => JSON.parse(JSON.stringify(value));
const counts = state => ({ liked: Object.values(state.favorites).filter(x => x.liked).length,
  unliked: Object.values(state.favorites).filter(x => !x.liked).length, viewed: Object.keys(state.viewed).length });

// Exact unchanged product functions generate the merge/upload. All dependencies
// remain in this shadow closure; no real cache/UI/retry/UUID accessor is called.
export function createOwnWriterHandle(deps, canonicalExecutor) {
  const { backup, readCandidate, normalize, merge, isCurrent, read, dispatch, lock, journal, signal: externalSignal } = deps;
  const controller = new AbortController(), signal = controller.signal;
  const abort = () => controller.abort();
  if (!backup || [readCandidate, normalize, merge, isCurrent, read, dispatch, lock, journal, canonicalExecutor]
    .some(fn => typeof fn !== 'function')) fail('invalid_contract');
  const rules = { expectedAccountId: backup.candidate.accountId, normalize, merge, isCurrent };
  createRecoveryBackup({ remoteSnapshot: backup.remote, candidate: backup.candidate,
    legacyLocal: backup.legacyLocal, evidence: backup.evidence, ...rules });
  if (backup.candidate.writerId === backup.legacyLocal.writerId) fail('invalid_contract');
  let claimed = false, dispatched = false, confirmed = false, before = null, after = null, expected = null, stage = 'preflight';
  let summary = { passed: false, failure: 'not_run', writeAttempts: 0 };
  const writerName = PREFIX + backup.candidate.writerId + '.json';
  const check = () => {
    if (signal?.aborted) fail('cancelled');
    if (isCurrent() !== true) fail('stale_owner');
    if (canonical(readCandidate()) !== canonical(backup.candidate)) fail('candidate_changed');
  };
  const durable = value => {
    check();
    if (journal(copy({ schema: 'drive-original.own-writer-attempt/1', accountId: rules.expectedAccountId,
      writerId: backup.candidate.writerId, writerName, before, expected, ...value })) !== true) fail('journal_failed');
    check();
  };
  const capture = milliseconds => collectSnapshot({ read, normalize, merge,
    expectedAccountId: rules.expectedAccountId, isCurrent: () => { check(); return true; },
    signal, limits: { milliseconds } });
  return Object.freeze({
    async run(budgetMs = 50_000) {
      if (claimed) return { passed: false, failure: 'already_claimed', writeAttempts: Number(dispatched) };
      claimed = true;
      let timedOut = false;
      const started = Date.now();
      let timer;
      const remaining = () => {
        check();
        const left = budgetMs - (Date.now() - started);
        if (timedOut || left < 1) fail('time_limit');
        return Math.min(30_000, left);
      };
      const bounded = operation => new Promise((resolve, reject) => {
        const interrupted = () => reject(Object.assign(new Error(timedOut ? 'time_limit' : 'cancelled'),
          { code: timedOut ? 'time_limit' : 'cancelled' }));
        signal.addEventListener('abort', interrupted, { once: true });
        Promise.resolve().then(() => { remaining(); return operation(); }).then(resolve, reject)
          .finally(() => signal.removeEventListener('abort', interrupted));
        if (signal.aborted) interrupted();
      });
      try {
        if (!Number.isInteger(budgetMs) || budgetMs < 1 || budgetMs > 54_000) fail('invalid_contract');
        externalSignal?.addEventListener('abort', abort, { once: true });
        if (externalSignal?.aborted) controller.abort();
        timer = setTimeout(() => { timedOut = true; controller.abort(); }, budgetMs);
        check();
        // The actual writer lock surrounds strict capture, one dispatch and full
        // independent readback. It does not lock other origins/devices remotely.
        const hooks = {
          candidate: copy(backup.candidate), signal,
          current: () => { try { remaining(); return true; } catch { return false; } },
          lock: (name, options, task) => {
            if (name !== `drive-original:account:${rules.expectedAccountId}:${backup.candidate.writerId}`
              || options.signal !== signal) fail('write_policy');
            return lock(name, options, task);
          },
          async catalog() {
            stage = 'before_capture';
            before = await capture(remaining());
            check();
            if (!compareSnapshots(backup.remote, before, rules).comparisonSummary.remoteEquivalent) fail('backup_mismatch');
            if (before.files.some(file => file.name === writerName)) fail('own_writer_exists');
            expected = merge(before.remote, normalize(JSON.parse(backup.candidate.cacheText)));
            if (canonical(expected) !== canonical(normalize(backup.candidate.runtimeProjection))) fail('backup_mismatch');
            return { id: null, files: before.files };
          },
          remote: catalog => {
            remaining();
            if (catalog.id !== null || catalog.files !== before?.files) fail('write_policy');
            return copy(before.remote);
          },
          async write(url, options) {
            remaining();
            if (dispatched || url !== UPLOAD || options?.method !== 'POST' || options.signal !== signal
              || Object.keys(options.headers ?? {}).join(',') !== 'Content-Type') fail('write_policy');
            const boundary = /^multipart\/related; boundary=(drive_original_\d+_[a-z0-9]+)$/.exec(options.headers['Content-Type'])?.[1];
            const metadata = JSON.stringify({ name: writerName, mimeType: 'application/json', parents: ['appDataFolder'] });
            const body = [`--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', metadata,
              `--${boundary}`, 'Content-Type: application/json', '', JSON.stringify(normalize(expected)), `--${boundary}--`, ''].join('\r\n');
            if (!boundary || options.body !== body) fail('write_policy');
            // Consume once before any await/fetch. The journal must be reread
            // durably by the injected sink; missing claim means zero dispatch.
            durable({ stage: 'attempt_claimed', writeAttempts: 1 });
            dispatched = true;
            stage = 'dispatch';
            let transportStatus = 0;
            try { transportStatus = Number(await bounded(() => dispatch(url, options))) || 0; } catch { /* Reconcile by reads only. */ }
            remaining();
            stage = 'after_capture';
            after = await capture(remaining());
            check();
            const own = after.files.filter(file => file.name === writerName);
            if (own.length !== 1 || own[0].writer !== backup.candidate.writerId
              || canonical(own[0].raw) !== canonical(normalize(expected))) fail('readback_mismatch');
            const other = { ...after, files: after.files.filter(file => file.name !== writerName), remote: before.remote };
            if (!compareSnapshots(before, other, rules).comparisonSummary.remoteEquivalent
              || canonical(after.remote) !== canonical(expected)) fail('readback_mismatch');
            stage = 'confirmation';
            durable({ stage: 'confirmed', writeAttempts: 1, fileId: own[0].id, transportStatus,
              after, confirmedByIndependentRawRead: true });
            confirmed = true;
            // Strict transport returns independently verified metadata, even
            // after lost/error upload response. No second create is attempted.
            return { json: async () => ({ id: own[0].id, modifiedTime: own[0].modifiedTime }) };
          },
        };
        await bounded(() => canonicalExecutor(hooks, { normalize, merge }));
        if (!confirmed) fail(dispatched ? 'submission_uncertain' : 'write_policy');
        check();
        summary = { passed: true, writeAttempts: 1, confirmedByIndependentRawRead: true,
          lockHeldThroughReadback: true, beforeFiles: before.files.length, afterFiles: after.files.length,
          otherDocumentsUnchanged: true, exactOwnBody: true, remoteEqualsExpected: true,
          localStateUnchanged: true, projection: counts(expected),
          capture: { before: before.capture, after: after.capture } };
      } catch (cause) {
        summary = { passed: false, failure: dispatched ? 'submission_uncertain'
          : known.has(cause?.code) ? cause.code : 'invalid_contract', writeAttempts: Number(dispatched),
          stage, cause: known.has(cause?.code) ? cause.code : safeBackupFailure(cause).failure,
          confirmedByIndependentRawRead: confirmed };
      } finally {
        clearTimeout(timer);
        externalSignal?.removeEventListener('abort', abort);
        controller.abort();
      }
      return copy(summary);
    },
    safeSummary: () => copy(summary),
    clear: () => { controller.abort(); before = null; after = null; expected = null; },
  });
}
