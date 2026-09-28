// Candidate gate: ordinary Drive files remain read-only. Verified own appData
// state writes use a separate, account/writer-scoped transport capability.
globalThis.__DRIVE_ORIGINAL_RUNTIME__ = Object.freeze({
  candidate: true,
  driveMutationsEnabled: false,
  accountStateWritesEnabled: true
});
