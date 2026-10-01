# RC32 corpus owner epoch

QA-only finite epoch `rc32-bounded-container-config-image-owner-epoch-20261001-2`,
immutable source `1d79897fd32c569137cab079bfd93107be2ee33f` / `1.22.0-rc.32`.
Old cross-epoch attempts are **UNKNOWN**; historical results remain historical.
No safe JSON, old capsule, provider state or browser state is imported.

## Build and execute

```powershell
node --test qa/rc32-corpus-owner-epoch/contract.test.mjs
node qa/rc32-corpus-owner-epoch/build.mjs
```

The builder returns `{expression, proof, context, provenance}` and writes only
`installer.epoch-2.expression.js` and `provenance.epoch-2.json`. The epoch-1
`installer.expression.js` / `provenance.json` remain historical producers.
`proof`/`context` are unchanged
pinned RC32 format-acceptance expressions. Root evaluates them through its
same-tab lexical app executor and privately retains the context text/proof.
After root's quiet-writer, visible/idle and exact-source qualification, evaluate
the installer expression **once**, then invoke the returned function:

```js
const registry = install(privateContextText, proof,
  'rc32-bounded-container-config-image-owner-epoch-20261001-2');
registry.start({maxJobs:8, deadlineMs:4800000, stopBeforeAt:rootDeadlineMinusMargin});
registry.read(); // Safe counters, parser projections, Boolean owner diagnostics.
```

`read().progress` exposes only active started/done/phase, metadata/media request
and byte counters plus processed count; root can sample every <=60s while a job
runs. Pending-file Range dispatches and received body bytes appear immediately.
Poll until `active:false` and `burst.done:true`; `coverage.queuedFresh` gives the
remaining unattempted count for the next explicit finite burst. `pause()` and
`cancel()` stop an active job. Once inactive, `cleanup()` destroys the private
registry and makes it unusable. The same evaluated installer rejects a second
allocation even after cleanup. There is no reset or import API.

## Structural scope and remaining unknowns

The frozen recursive repeated inventory/selector/reader/comparator, fresh strong
revision/checksum pre/post metadata, exact identity/resource key, Range/body,
source/controller/auth/account, full projection/writer/revision/sync and final
release/catalog fences are preserved. The deduplicated candidate union includes
every image/video MIME candidate or explicitly listed common extension,
including octet-stream TS/MTS/M2TS names. Ineligible objects remain denominators.
No media GET covers a whole file; one-byte objects are ineligible.

The leaf's inventory wrapper expands every raw list, root, priority and shortcut
target GET to the full maintained item projection plus `headRevisionId`,
`sha256Checksum`, `resourceKey`. It compares every raw duplicate and both complete
passes, then compares complete before/after catalogs, including root and shortcut
metadata. Errors remain latched even if the underlying shortcut reader catches
them. No partial/page-only inventory qualifies continuity.

Each prior record and consumed attempt must match identity and an exact nonempty
strong tuple in the new complete inventory before coverage or new body work can
proceed. Version alone cannot carry results. Every retained record must also match
its consumed attempt baseline. Same-version checksum/head/resource-key drift,
deletion, shortcut ambiguity, or incomplete qualification quarantines the retained
results. Missing head **and** checksum in list metadata can use paired canonical
before/after head GETs for <=32 carried entries (<=64 fallback heads/job), with
final-fence capacity reserved. Missing baseline, unavailable canonical strong
metadata, a partial tuple mismatch, or more missing entries stops honestly;
no fallback resets attempts. New body files still use unchanged strong pre/post
head GETs, Range/body and per-file limits.

- ISO: frozen top-level/sparse-moov/track parser, sample-entry codecs and observable
  AVC/HEVC/AAC config, dimensions/channels/rate/encryption/color/SAR presence.
  Parameter sets, opaque config, sample tables, HDR/VFR and decoding are unqualified.
- EBML/WebM/Matroska: actual Tracks/codec IDs/dimensions/audio fields plus private
  config/color/default-duration presence; codec-private bytes/timing are unparsed.
- TS: immutable RC32 shared Q1/container parser on <=1MiB aligned head. Complete
  CRC-qualified PAT/PMT plus parsed H.264 SPS/AAC ADTS configs can classify.
  Missing/broken PSI/SPS, unsupported elementary configs and outside-head changes
  remain unknown. No timeline/decoding claim.
- PNG/JPEG/GIF/WebP/BMP: dimensions and applicable header fields; JPEG marker scan
  <=64KiB. Rotation and unobservable animation absence remain unknown. Other image
  formats and AVI structural metadata are unknown. Unknown codecs never qualify.

Coverage distinguishes `classified`, `unknown`, `failed`, `quarantined`,
`ineligible`, `unattempted`, parser-budget/deadline `deferred` and
`quarantinedConsumedAttempts`. `denominatorQualified:false` means inventory was
not qualified; zero counters then do not claim an empty corpus.
`configurationRepresentatives` selects one redacted sample per distinct observed
metadata config. It is a manifest; no normal-UI playback navigator is added.
`wholeCorpusComplete:false` is unconditional. Root owns FM01/CORPUS06 acceptance.

Each job: <=512 metadata GETs/64MiB/600s, <=64 files, serial subbatches of eight.
Each file: <=64 media GETs/(2MiB+8192B)/50s; each GET <=1MiB/10s headers.
Each explicit burst: <=8 jobs/80min and root absolute deadline with cleanup/token
margin. Final inventory capacity is reserved; budget omissions remain unattempted.
Private registry cap16384 covers the reported8596 union; no write request exists.

## Fatal quarantine and explicit recovery

`maxFreshAttemptsPerFile:1` consumes privately before async preflight/Range.
Fatal failures retain attempts and provisional outcomes in the same evaluated
registry, without automatic retries or exhaustion resets. Safe owner diagnostics
contain only Booleans for account/key/auth/drive/token/expiry/abort/controller/
writer/revision/projection/sync/source/media/playback/retirement/visibility/online.
The old actual fatal cause/time is **unknown**; account refresh and visibility
loss are possible explanations, not findings.

After OWNER_CHANGED, `start()` rejects. Root may explicitly call `recover()` with
the same finite burst options once the same source/account/key/drive generation/
controller/writer/source generation/href is freshly visible, idle and stable.
Recovery is metadata-only: **all** consumed entries including failures qualify
through complete repeated strong before/after inventory; only absent list tuples
need the <=64 fallback heads described above.
This avoids per-record head replay when the full inventory supplies the tuple.
Normal continuation is blocked until all entries qualify. No consumed file gets
another media attempt. Missing
immutable preflight baseline, changed tuple/catalog/owner identity, cleanup failure
or another unsafe class is terminal. JSON reconstruction/new registry is not recovery.

After an inactive released, complete, catalog-stable job, root may explicitly call
`registry.rebindCredentials()` before the next explicit `start()` burst. Only
`token`, `tokenRevision`, `expiresAt` may differ. Account/key/auth generation/drive,
controller/source proof, media/playback/retirement, writer/revision/deep projection,
href and abort ownership must remain identical, the writer must be idle, and the
current token must be usable with future expiry. Active, quarantined, stopped,
unreleased or unqualified states reject rebind. Rebind performs no requests and
does not qualify old results itself: the next job still freshly qualifies the
complete strong inventory. During an active job, token drift still cancels and
quarantines through the existing owner fence. No automatic renewal or epoch loop.

Local tests exercise public synthetic ISO/EBML/TS/image bytes and a synthetic
lexical app, including actual maintained parsers, inventory/facade, visibility/
projection drift, fatal quarantine, strong metadata recovery, tuple rejection,
no JSON import/reset, caps and explicit root deadline. Actual account/browser/
whole-corpus execution is unperformed by this deliverable.
