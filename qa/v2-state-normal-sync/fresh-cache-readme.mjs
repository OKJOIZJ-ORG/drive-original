// Maintained invocation notes (plain comments; not an executable live driver).
// Build: node qa/v2-state-normal-sync/fresh-cache-build.mjs
// Verify: node --test qa/v2-state-normal-sync/fresh-cache-test.mjs
// root loads fresh-cache-factory.generated.js exact public text into the current
// authenticated lexical context. No real token is an argument to this factory.
//
// const job = factory({ expectedAccountId: capturedDrivePermissionId,
//   expectedProjection: privatelyCapturedCurrentRemoteUnion, // optional but
//       // required to claim equality with the independently read remote snapshot
//   read: nativeGetWithCapturedInMemoryCredential,
//   isCurrent: unchangedRealAccountAuthTokenRevisionControllerAndLifecycle,
//   signal: lifecycleAbort.signal });
// await job.run(); job.safeSummary(); // fixed codes, booleans and counts only
// job.readPrivateProjection(); // private in-memory comparison only; never print,
//     // export, write to a public file, or include IDs in a report
// job.clear(); // drops projection, aborts read scope and clears shadow timers
//
// read accepts ONLY an already-reviewed GET URL and options with no headers/body.
// Root must additionally retain its actual account/auth/Drive generation, token
// identity/revision/expiry, controller and account-abort fences before dispatch
// and after completion. Factory strips the shadow synthetic Authorization. The
// native adapter adds its privately captured actual token, never refreshes/retries,
// uses passed signal and no-store/redirect:error/credentials:omit. isCurrent must
// retain any projection/cache/writer fences required by the live comparison.
// No native mutation is permitted, including generateIds or session credentials.
//
// Exact complete app.js source is byte-identical inside a lexical closure with
// empty Map storage, inert document/window, disabled mutation flags and parked
// shadow timers. Only initializeAccountMediaState executes; init/DOMContentLoaded
// never executes. Its actual driveFetch, validation, pagination, normalization,
// read cache and merge reconstruct state; no conflict engine is duplicated.
// Budget: <=30s, <=100 GETs, <=8MiB consumed body bytes, <=16 catalog pages,
// <=64 recognized document IDs. Failed providers are not parsed/refreshed/retried.
// Failed or cancelled jobs expose no private projection. clear after completion.
//
// This proves fresh empty-cache reconstruction in an isolated runtime of the
// current app text. It is not a real new origin OAuth flow, physical-device proof,
// ordinary sync write/UI proof, or a stable raw remote snapshot. Catalog/body
// TOCTOU remains: root independently compares with maintained complete raw readback
// and retains live owner/projection fences. Source SHA-256 proves source identity,
// not remote identity or private-state integrity. No cookies/storage/media/OPFS
// are copied from the real app; only the private normalized union may be read.

// The exact generated source is committed as .generated.js.gz to preserve the
// app source bytes (including inherited blank-line whitespace). Build regenerates
// plain/generated and archive; archive JSON verifies full decompression equality.
