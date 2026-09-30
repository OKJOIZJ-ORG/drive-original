# Fixed rc25 actual-PC performance preparation

Prepared only. No account/browser/device/media operation was executed by this producer.
OBS03 (immutable spec lines1489–1504), and rc21-night-acceptance item8 retain their
original targets and unsuccessful-attempt requirement. This folder contains no
private IDs, names, tokens, originals or synthetic claim of real-PC acceptance.

Exact source: `7ba8e654fa38def8c8e00efcbf1600a4c8730c53`, `1.22.0-rc.25`.
`binding.json` binds committed app/SW/version bytes. Runtime `proof.get()` must
independently establish those same public bytes and the current activated controller.
The supplied proof is the existing `window.__driveNightCorpus.proof`; recreate that
proof for25 after root's public verification. An old24 proof is rejected. The
observer performs **zero fetches**, adds no playback/resource wrappers and invokes
no app playback, seek, close or media-download API.

Regenerate only for an explicitly final source/version:

```powershell
node qa/rc25-performance-preparation/bind.cjs 7ba8e654fa38def8c8e00efcbf1600a4c8730c53 1.22.0-rc.25
node qa/rc25-performance-preparation/verify.cjs
node --check qa/rc25-performance-preparation/observer.expression.js
```

Root runtime procedure through existing normal authenticated Chrome/native CUA:

1. Verify final public25 and fresh same-source SW proof, normal account/library,
   foreground, closed player, settled prior retirement. Preserve account, cookies,
   native cache and original files. Load `observer.expression.js` using the existing
   local-file bridge with its exact SHA256, then evaluate once. No network loader.
2. `window.__rc25PerformanceQA.next()` returns only sample ordinal, action kind,
   safe metadata category and currently rendered card rectangle. Ten private file
   selections come from `state.files` entries with currently rendered normal cards;
   one per available extension/size band first, then additional unique files.
   Four metadata bands do not imply codec/container acceptance. No complete-root
   traversal or old corpus count is inferred. Fewer than ten is a fixed preflight
   rejection, never a silent duplicate/shortened run.
3. For each sample: trusted normal card click for first startup; wait for its row;
   normal close; allow2s and inspect close record; click same card for warm reopen;
   wait for row; pause using normal controls; use the normal progress track at
  10%,50%,90% rotating between the ten samples; wait for seek row; normal close
   and allow2s. This yields **20 startup rows +10 paused seek rows**, with failures
   and timeouts retained. After a failed startup, recover/reopen through normal UI
   as needed; no forced route/API playback. A failed run cannot be labeled complete
   unless all30 intended rows are captured. An additional trusted card/seek input
   during an active measurement records `EXTRA_INPUT`; avoid it. The pointer
   tolerance is ±1.5% of track width.
4. `read()` returns only bounded sanitized fields. rVFC decoded target frames,
   player generation/source ownership and shifted general-Q1/Q2 source clock are
   required; `currentTime` alone never passes. First decoded frame is stored, then
   settlement is sampled independently so a paused target's single frame need not
   be emitted again after the loader hides. First/frame time and settlement time
   remain separate. Q1/Q2 must have a newer seek generation and matching player target.
5. Startup has30s outcome bound; paused-seek target frame has15s bound, explicitly
   including the intentional paused presentation wait. Foreground unpaused frame
   over15s is recorded separately; OBS03 pause/hidden exclusions are retained.
   Header time is observed from completed same-owner Resource Timing only:10s is
   recorded when exposed. Unavailable/incomplete timing is `headerUnknown:true`,
   never an invented header pass or extra header request. Close has2s sampled
   release test. An idle/whole observer deadline is15min; after the30th row it
   auto-releases in30s to permit final close. `clear()` releases immediately and
   returns the final sanitized result; it does not close the player.
6. Save only the sanitized `read()` or `clear()` result inside this folder, then
   `node qa/rc25-performance-preparation/summarize.cjs <absolute-result-json>`.
   Inspect all close records, errors, timeouts and owner/source changes. `complete`
   means all30 attempts were recorded and observer stopped; it is not all-pass.
   Remove `window.__rc25PerformanceQA` once the result is saved. Root may pair
   `qa/host-resource-snapshot.py` before/after with this result; no observer reset,
   forced GC, Chrome process mutation or native-memory plateau claim is made here.

The summarizer reports each route/action/cache condition separately, failed
observations as infinite/censored in nearest-rank empirical p95, all fixed codes,
counts and uncertainty. A route/condition with fewer than20 attempts is explicitly
marked. Q0 first-start5s/warm2s/seek3s remain initial design targets, not silently
adjusted to the previous6–16s Q1 seek observations. First-open and same-file reopen
cache states are **unknown** without independent genuine cache proof; no cookie,
global-cache purge or forced-cold action is performed and those rows cannot claim
cold/warm target acceptance. Q1/Q2 seek rows have no adopted route-specific budget.

Optional JS heap, append/removal/window counters, direct-owner count, retired-trace
count, ready/watchdog/loading/owner fields and retirement booleans are meaningful
within their stated owner. Resource Timing excludes SW upstream details and can
hide headers/bytes. Renderer JS heap excludes native/WASM/process resources. Ten
metadata-diverse available files do not establish the full corpus, every format,
Android endurance, physical output, production acceptance or stable p95 reliability.

Local verification:11 discriminators passed including trusted-only/wrong-card
rejection, currentTime-only counterexample,30s timeout, fixed media error, changed
account stop, paused wrong-target timeout, Q2 decoded shifted target, old Q1
generation rejection, retained-close failure, failure-inclusive/censored p95,
and a full30-row sequence with one retained failed startup and privacy/cleanup.
