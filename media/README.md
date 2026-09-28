# Q1 product routing — local rc.7, deployed candidate rc.6

Observed 2026-09-27. A possible strict188-byte TS candidate takes an exact940-byte
identity-fenced sniff before native delivery, when MSE/Worker exist and the media
element reports no native TS capability. Safe listed size>=940 and divisibility
by188 are only skip hints, not identification; unknown/stale hints retain the
later code4→Q1 path. Other files and native TS capability keep Q0 first. A false
TS signature returns Q0 after cleanup; the probe costs three metadata reads and
one940-byte read only for eligible candidates. Extension and Google preview are
not success evidence. This bounded H264/AAC TS path is not all-format support. Observed DTS/PTS
intervals are retained, including fractional cadence and independently phased
windows. Regressions, duplicate PTS, excessive reorder, large single intervals,
explicit discontinuities and overlapping GOP presentation remain rejected.

## Ownership

`drive-source.mjs` owns serial reads of at most1MiB. The page supplies metadata
through its existing auth coordinator and bytes through its existing same-origin
service worker. No media passes through the auth server. Account/session identity,
headRevisionId, size, modification time, MIME, permission and optional checksum
are checked before/after every read against one baseline; version is a metadata
counter and may change on a view. This is an optimistic observed-content fence,
not an atomic revision snapshot or per-range cryptographic proof. No revision is
pinned with keepForever, and source originals are never changed.

Only otherwise-valid opening metadata with an absent headRevisionId can decline
early Q1 eligibility before any bytes and retain Q0. Permission denial, malformed
metadata, drift and unknown cleanup are never hidden by this fallback. A checksum
first exposed on later metadata becomes a new immutable identity snapshot and
is bound across admission, subsequent reads and all seek generations.

Source abort tracks pending callbacks/stream cancellation, with a separate bounded
cleanup result. Unknown/failed cleanup blocks another Q1 owner in the page until
reload. Normal fetch cancellation starts reader cancellation before aborting its
signal, avoiding a reproduced false AbortError cleanup failure. Real failures
remain failures. Tokens/remote URLs never enter the media worker.
Initial Q0 replacements also wait for this barrier. A monotonic initial-route
owner prevents same-session duplicate starts from bypassing an unfinished probe.

`ts-player.mjs` owns MSE/ManagedMediaSource, one worker, one fragment ACK,
generation replacement and source-buffer eviction. Seek uses bounded sparse
source-clock/RAP discovery and packet-preserving bootstrap, not a prefix walk.
Absolute requests clamp to actual first/last picture anchors. A real shorter
audio EOF stays shorter; no silence is fabricated. The source clock is sampled,
not globally validated. The target seek promise does not hold a fragment ACK:
the next fragment may be needed before the browser can finish the seek.
Every muxed video timestamp is checked against its original PES timestamp.
The final sample duration of a fragment uses observed next-DTS lookahead; only
true EOF uses the last observed interval as an explicit duration estimate.
No source/PES clock, encoded video/audio payload, or resolution is changed.

Forward admission uses6/4-second hysteresis and retains6 seconds behind. This
limits exposed media time, not the total JS/transport/mux/MSE/decoder memory.
Worker input is64KiB, source epochs256KiB; parser/GOP/output limits fail closed.
Pause has no lifetime timeout. Closure/replacement releases owned buffers, worker,
URL, source callback ownership and temporary remote-playback settings. App frame
and seek watchdogs require presentation, never merely append. Playback intent,
position, speed, volume/mute and stale metadata callbacks retain their owners.

Only an explicitly observed Range503 may be retried, once per complete player
lifetime (seeks do not replenish the budget). The failed source must settle
cleanup before a cancellable250–2000ms wait and new source; content/account and
any checksum learned on failed preflight bind the exact same range. Long/invalid
Retry-After, other statuses, body/metadata failures and malformed206 stay terminal.
No failed bytes reach the worker; no native/wholebody/iframe fallback is introduced.

## Reproducible build and evidence

`node scripts/build-q1.cjs` builds the canonical tested primitives into standalone
public modules. No QA path is imported at runtime. `build.json` binds compiler,
inputs and output hashes; static tests reject stale generated files. Pinned mux.js
7.1.0 is shipped unchanged with its Apache2 license. The shared18-file public
allowlist includes only six media assets and excludes source entries, manifest,
README and all QA/private records. All six assets are in the offline shell cache.
Scoped Git attributes keep public text/Q1 producer line endings stable on Windows;
the vendor artifact is byte-preserved. Report hashes are checked against Git blobs,
not only the working copy, before the savepoint.

- `node --test --test-concurrency=1 tests/*.test.js tests/*.test.mjs`:339/339.
- `node --test --test-concurrency=1 qa/v2-07b-ts-q1/*.test.mjs`:120/120.
- `node qa/q1-product-audit.cjs`: actual app+SW, synthetic Drive responses,16/16.
  Original code4+one retry → real frame; UI seeks1.2/6.1/0/end/11.95, EOF,
  saved-position/autoplay intent, source drift before MSE, pending close,
  Q1 seek-watchdog failure without Q0 retry, and six cached assets.
  Early TS emits a frame without any open-ended native read; aligned/ordinary
  MP4 and missing revision retain Q0. Early resume, native capability, closed
  probe, permission/revision/checksum contradiction and duplicate pending setup
  have explicit discriminators.
- `node qa/q1-lifecycle-audit.cjs`: actual Chrome product lifecycle9/9,
  including held/noncooperative callbacks, true failed cancel and real fetch
  abort. MMS-shaped Chrome subclass is ownership testing, NOT actual iPhone MMS.
  A checksum first acquired while reading is enforced before any later seek byte.
  Failed/pending503body cancellation blocks both recovery and subsequent seeks.
- `node qa/q1-resilience-audit.cjs --baseline`: reproduces the pre-fix termination
  using public Git bytes from22f7271, without resetting the checkout.
- `node qa/q1-resilience-audit.cjs`:12/12 actual app/SW synthetic modes. One503
  recovers to EOF with all24worker input and6output fragment sequence/offset/size/
  hash records equal to fault-free control. Repeated error, content/checksum/
  permission changes, long delay, malformed206 and cancellation terminate safely;
  a seek does not replenish the retry budget. No actual network-outage claim.
- `node qa/q1-preservation-audit.cjs`: native5/5 at0/1.2/6.1/11.95/end.
  Strict zero-diagnostic decode, coded bytes/metadata/absolute clocks, original
  video suffix and all original AAC/same-start PCM agree. Beginning also matches
  uninterrupted full-source PCM. Different uninterrupted decoder histories after
  a seek remain separate, as recorded in prior continuous-seek evidence.
- `node qa/functional-audit.cjs q1-routing-functional`: existing product regression22/22.
- `node qa/q1-priority-app-audit.cjs qa/player-stage-v2-01c/private-sample.json`:
  actual local208MB original through app+SW, first frame after2,687,372 bytes,
  10/50/90% within one frame and near-end→ended;46 finite ranges total,
  no native code4/open-ended read, no iframe. Full source fingerprint/stat unchanged.

The three Q1 reports contain producer hashes in their respective `qa/q1-*`
directories. The earlier QA reports remain historical fixed-producer evidence;
these current product-edge reports do not rewrite those earlier observations.

## Remaining gates and recovery

Priority follow-up: the actual208MB local original passes full-source product
component Chrome16x playback, bounded pause/seek/cleanup, and native all-frame,
coded, absolute-timing and full PCM comparisons. Reports are underqa/q1-priority;
scope and recovery are in memory/Q1-PRIORITY-20260927.md. Original is unchanged.

Not yet verified: current authenticated Drive priority file/version and live whole-app
priority playback, physical iPhone Chrome/Safari/PWA, actual audibility/color,
expiry/background long-run behavior, full-format support and total memory.
The early eligible route removes native whole-body TS attempts. Native capability
claims and stale/missing listing hints can still defer Q1 to the existing late
fallback. No claim that synthetic success closes the remaining live gates.

The subsequent approved candidate deployment serves rc.6/22f7271:19public files
equal Git bytes,17cached public shell files equal those bytes, and cold/offline
unauthenticated Chrome checks pass (memory/CANDIDATE-RC6-20260927.md).
No merge/push, original mutation or candidate Drive writes occurred; production
v1.21.0 is unchanged. Local recovery: revert this coherent product commit on the work
branch through a new commit, retaining prior QA and user work. Candidate recovery
if later deployed: normal redeployment of the previous committed allowlist/auth
configuration; no cookie purge, appData rewrite or original-media operation.
