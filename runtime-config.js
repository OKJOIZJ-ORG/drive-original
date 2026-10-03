// Production mode. Account, grant, revision and verified-result ownership still
// govern every Drive operation; this flag does not grant Google permissions.
globalThis.__DRIVE_ORIGINAL_RUNTIME__ = Object.freeze({
  candidate: false,
  driveMutationsEnabled: true,
  accountStateWritesEnabled: true
});
