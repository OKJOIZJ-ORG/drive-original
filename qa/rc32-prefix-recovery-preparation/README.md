# rc32 finite prefix recovery preparation

Observed local preparation only, pinned to immutable Git
`1d79897fd32c569137cab079bfd93107be2ee33f` / `1.22.0-rc.32`.
The frozen rc31 prefix factory/runner are rebound by exact literals. The copied
continuity, selector, probe and runner logic is checked against those originals;
reader/parser/selector/fence/retry/cleanup budgets are unchanged. Source hashes
are verified from the exact committed bytes, never mutable HEAD. The exact32
source proof and four-key context preparations come from the frozen
`../rc32-format-acceptance` leaf. `inputs.json` pins only named safe inputs;
`provenance.json` and `freeze.json` freeze this preparation and its dependencies.
No private backup/result, browser, account, provider, device or network was read;
no product, old QA, global configuration or Git state was changed.

This runner establishes **940-byte actual prefix signatures only**. It does not
parse codec/config/tracks, establish a codec/config union, test decoder/playback/
audio/device behavior or qualify all image headers. Inventory MIME/extension
counts are metadata counts, not actual image-header observations. Successful
representative image signatures are scoped only to those actual reads. Whole
video signature coverage is useful but the whole feasible codec/config union and
separate whole-image header classification remain explicit subsequent work.
`wholeCorpusComplete` always remains false, including when every eligible video
prefix is validated. Unknown signatures remain unknown. Failed, ineligible and
unattempted cases remain in the current reconciled denominator.

The new evaluated factory owns a fresh private WeakMap registry; historical31 or
failed32 JSON/capsules are never imported. It admits successful records only with
exact Range/body validation, strong immutable preflight/postflight tuple equality,
complete stable before/after catalog and awaited release without fatal failure.
It retains no media bytes, token, resource key or provider name. Each private
record includes account/file/version/size/modifiedTime/MIME/download capability,
strong revision/checksum, actual signature and evidence epoch. The separately
bounded attempt ledger survives idle renewal and phase changes. Both collections
are limited to8192 unique files. Capsules are opaque and unforgeable; the evaluated
entry has no private-record export or deeper-parser bridge. A future bridge must
freshly qualify current catalog/owner/full tuple rather than treating safe JSON
or this opaque signature handle as current codec evidence.

At most2 fresh attempts per file. One extra explicit attempt requires transient
`PREFLIGHT_FAILED`, `POSTFLIGHT_FAILED`, `HEADER_TIMEOUT`, `BODY_TIMEOUT` or
`FILE_TIMEOUT`, an already usable strong preflight baseline, unchanged current
catalog identity and equal fresh strong tuple before any media read. Missing
baseline, invalid validator, payload or protocol failure is exhausted after1.
Source/controller/account/owner/catalog/content drift, cancellation, metadata
limits or cleanup failure stop the runner. They never publish partial continuity
or start later jobs. Failed jobs retain their honest safe results independently.

Limits: representatives<=36, videos<=64/job, serial sub-batches8, four inventory
passes/job, observed first-inventory envelope+25%/margins reserved for final
inventory; metadata<=512GET/64MiB/600s per job,2MiB per response,25s inventory
request and10s file-metadata request. Media<=64GET/2MiB+8192/50s per file,
1MiB per GET,10s headers/no-progress; the prefix runner actually reads only
`bytes=0-939`. Files<=940B are ineligible to avoid whole-file GET. No continuation
or whole-file media read. A finite explicit burst is<=8 jobs/80min with a fresh
root deadline before credential/natural-watch cutoff and cleanup margin. There
is no automatic start, outer retry loop, scheduling or renewal during active work.
Generic upstream cleanup remains unknown.

Root first removes prior corpus owners and waits for owned release. Qualify exact
served32 app/SW/cache/player-module bytes and the activated controller. Keep the
app visible, playback/retirement/writer settled and idle, with no simultaneous
account playback, writer or other corpus reader. The prior actual32 cohort2
`OWNER_CHANGED` failure stays failed; this preparation does not reinterpret it.

Evaluate `sw-proof.expression.js` into a fresh private proof handle, require
`.poll().done` and `.poll().accepted === true`; it performs4 static GETs and0
Drive reads. It does not replace independent served-module qualification.
Privately assign the exact designated priority name to
`window.__rc32DeeperPriorityName`, then evaluate `derive-context.expression.js`.
It performs<=2 metadata GETs and stores opaque four-key JSON at
`window.__rc32DeeperContext`; never print it. It requires proof under
`window.__rc32DeeperSwProof`. Root may reuse an already freshly qualified exact32
proof/context only after independently validating the same controller/account/
drive generation. The context preparation uses those names unchanged.

Evaluate this leaf's `runner.expression.js` once into a private installer, then:

```js
window.__rc32PrefixRecoveryRunner = window.__rc32PrefixRecoveryInstall(
  window.__rc32DeeperContext, window.__rc32DeeperSwProof
);
// Root qualifies a fresh cutoff before every explicit start.
window.__rc32PrefixRecoveryRunner.start({
  maxJobs: 1, deadlineMs: 600000, stopBeforeAt: PRIVATE_FRESH_SAFE_CUTOFF
});
window.__rc32PrefixRecoveryRunner.read(); // Safe bounded counters only.
```

Installer accepts no caller factory, prior capsule or saved JSON. First phase is
representatives; after queuedTotal0, it moves to all discovered unique video
objects selected by MIME-or-extension union. Videos are<=64 per finite job.
Retry candidates precede new files. Partial settled stable successes advance the
opaque capsule even when individual transient files fail. Idle completed bursts
can continue with a new explicit start after renewal if drive generation matches.
Exhausted files remain failed; queue exhaustion with failed>0 never sets
`eligibleVideoPrefixesComplete`. Source failure/cancel/pause/deadline is terminal;
creating another registry to bypass exhausted attempts is not a continuation.

For a separately explicit factory-only job, evaluate `factory.expression.js`,
call `entry(context,proof,null,{phase:'videos',maxFiles:64})`, await poll done,
then retain only `.continuity()` privately. Future calls to this same evaluated
entry may take that opaque handle; `entry.clearContinuity(handle)` releases it.
This is an alternative owner to the runner, never a simultaneous corpus job.
It provides the existing private signature registry API, with no raw export.

Before cleanup save only runner `.read()` safe results. `.pause()`/`.cancel()`
cancel the active job. `.cleanup()` requests cancellation and clears retained
capsules/context/proof after release; wait for `.read().disposed === true` and
`active === false`. Call owned proof `.clear()`, then delete only owned
installer/runner/context/proof/name globals. Never print context, raw identity,
tokens, media names or keys, or clear browser cookies/caches as QA cleanup.

```text
node qa/rc32-prefix-recovery-preparation/build.mjs 1d79897fd32c569137cab079bfd93107be2ee33f
node qa/rc32-prefix-recovery-preparation/verify.mjs
node qa/rc32-prefix-recovery-preparation/verify.mjs --check
```

Local21 synthetic checks cover inherited19 recovery/owner/budget/privacy cases
plus exact32 drift/alias refusal and old/hash-mismatched proof denial. Real
inventory/facade lexical fixtures prove partial continuation without provider
activity. Actual execution/requests remain0. Root owns independent review,
actual execution and staging/commit; `curated-savepoint.json` lists only this leaf.
