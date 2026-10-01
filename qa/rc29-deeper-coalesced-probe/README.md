# rc.29 bounded deeper probe with metadata windows

Additive derivative of the frozen rc.28 selection diagnostic. This producer binds
only exact Git `10f1dd2ee9550866933e693dbf41c62e1fb2daad`, rc.29 app/SW/version bytes.
The old rc.28 producers and actual attempts remain evidence.

The confirmed request-granularity issue is many tiny sparse metadata reads. After
the maintained top-level scanner validates one moov, this derivative caches at
most 16KiB windows inside its body. Small bodies are split; no single full-moov,
mdat payload, or whole-file GET is admitted. Sample-table and unknown metadata
may be prefetched **unparsed**. Only the maintained sparse grammar's metadata
leaves enter the derived tree. Owned copies are zeroed on release; source/account
checks run on cache hits too. The unchanged reader enforces 64 media GETs and
2MiB+8192 bytes per file, 50s lifetime, no auth retry, 8 files and 600s run; existing
512 metadata GET / 64MiB aggregate and final-inventory reserve remain binding.

File time/request/byte limits can yield a retained `deferred` outcome only with
exact identity postflight and settled owned serial read cleanup. Ownership,
identity, malformed response, catalog, cleanup and remaining run/metadata/reserve
failures remain terminal. `complete` means every planned file was attempted and
a fresh complete final inventory matched; `filesComplete`, `filesDeferred`,
`allFilesComplete`, each failure and disposition explicitly report media results.
A timeout is never a successful file. HDR/VFR/codec risk denominators stay unknown.

Build and local verification: `node qa/rc29-deeper-coalesced-probe/verify.mjs`.
The generated factory uses the existing loader API:
`entry(privateContextJSON, currentProof, {cohort:1, mode:'probe'})`, then `poll()`.
After release and stable final catalog, use `await entry.target(reference)` or
`await entry.navigationTarget(reference)` for normal UI coordinates only.
`entry.cleanup()` clears private registry state. Use fresh rc.29 context/proof.
Targets retain the previous exact fresh one-GET version qualification, normal UI
metadata match and owner/projection/idle fences; UI versions are not injected.

All verification here is local mock execution. No actual browser/Drive/account
request, product edit, staging, commit or external lookup was performed this unit.
Postflight establishes a bounded observation, not atomic remote identity or
cryptographic security against privileged DevTools. Generic upstream cleanup
remains unknown; only this reader's awaited cleanup is claimed settled.
