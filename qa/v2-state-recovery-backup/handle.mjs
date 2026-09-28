import { captureRecoveryBackup, serializePrivateBackup, verifyRecoveryReread, safeBackupFailure, RecoveryBackupError } from './backup.mjs';

// Factory only; no globals, storage, credentials or direct provider access. Root
// injects the existing app normalize/merge and a narrowly scoped read transport.
export function createRecoveryBackupHandle(dependencies = {}) {
  let claimed = false, cleared = false, payload = null;
  let summary = { passed: false, failure: 'backup_unavailable' };
  const controller = new AbortController();
  const externalSignal = dependencies.signal;
  const abort = () => controller.abort();
  const options = { expectedAccountId: dependencies.expectedAccountId,
    normalize: dependencies.normalize, merge: dependencies.merge,
    isCurrent: () => !cleared && dependencies.isCurrent?.() === true };
  const copy = value => JSON.parse(JSON.stringify(value));
  const available = () => {
    if (cleared) throw new RecoveryBackupError('backup_cleared');
    if (!payload) throw new RecoveryBackupError('backup_unavailable');
  };
  return Object.freeze({
    async capture() {
      if (cleared) return { passed: false, failure: 'backup_cleared' };
      if (claimed) return { passed: false, failure: 'run_already_claimed' };
      claimed = true;
      externalSignal?.addEventListener('abort', abort, { once: true });
      if (externalSignal?.aborted) controller.abort();
      try {
        const result = await captureRecoveryBackup({ ...dependencies, ...options, signal: controller.signal });
        if (cleared) throw new RecoveryBackupError('backup_cleared');
        payload = result.privatePayload; summary = result.summary;
      } catch (cause) { summary = cleared ? { passed: false, failure: 'backup_cleared' } : safeBackupFailure(cause); }
      finally { externalSignal?.removeEventListener('abort', abort); }
      return copy(summary);
    },
    safeSummary() { return copy(summary); },
    // PRIVATE methods: root must consume via remote handle, never tool output.
    readPrivatePayload() { available(); return copy(payload); },
    readPrivateText() { available(); return serializePrivateBackup(payload, options); },
    verifyReread(rereadText) {
      try { available(); return verifyRecoveryReread({ original: payload, rereadText, ...options }); }
      catch (cause) { return safeBackupFailure(cause); }
    },
    clear() { cleared = true; payload = null; controller.abort(); summary = { passed: false, failure: 'backup_cleared' }; }
  });
}
