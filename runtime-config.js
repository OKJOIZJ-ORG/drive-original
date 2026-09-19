// Candidate safety gate. V2-04B begins read-only until the same-account
// appData snapshot/read/compare gate has been recorded.
globalThis.__DRIVE_ORIGINAL_RUNTIME__ = Object.freeze({
  candidate: true,
  driveMutationsEnabled: false
});
