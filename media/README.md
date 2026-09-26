# Q1 product vertical slice — local rc.5

Observed 2026-09-27. Native original delivery remains first, with its existing
one native retry. A code4 failure may enter Q1 only after a bounded actual-byte
TS sniff. Extension and Google preview are not success evidence. This strict
path supports the tested single H264/AAC CFR TS combination, not all formats.

## Ownership

`drive-source.mjs` owns serial reads of at most1MiB. The page supplies metadata
through its existing auth coordinator and bytes through its existing same-origin
service worker. No media passes through the auth server. Account/session identity,
headRevisionId, size, modification time, MIME, permission and optional checksum
are checked before/after every read against one baseline; version is a metadata
counter and may change on a view. This is an optimistic observed-content fence,
not an atomic revision snapshot or per-range cryptographic proof. No revision is
pinned with keepForever, and source originals are never changed.

Source abort tracks pending callbacks/stream cancellation, with a separate bounded
cleanup result. Unknown/failed cleanup blocks another Q1 owner in the page until
reload. Normal fetch cancellation starts reader cancellation before aborting its
signal, avoiding a reproduced false AbortError cleanup failure. Real failures
remain failures. Tokens/remote URLs never enter the media worker.

`ts-player.mjs` owns MSE/ManagedMediaSource, one worker, one fragment ACK,
generation replacement and source-buffer eviction. Seek uses bounded sparse
source-clock/RAP discovery and packet-preserving bootstrap, not a prefix walk.
Absolute requests clamp to actual first/last picture anchors. A real shorter
audio EOF stays shorter; no silence is fabricated. The source clock is sampled,
not globally validated. The target seek promise does not hold a fragment ACK:
the next fragment may be needed before the browser can finish the seek.

Forward admission uses6/4-second hysteresis and retains6 seconds behind. This
limits exposed media time, not the total JS/transport/mux/MSE/decoder memory.
Worker input is64KiB, source epochs256KiB; parser/GOP/output limits fail closed.
Pause has no lifetime timeout. Closure/replacement releases owned buffers, worker,
URL, source callback ownership and temporary remote-playback settings. App frame
and seek watchdogs require presentation, never merely append. Playback intent,
position, speed, volume/mute and stale metadata callbacks retain their owners.

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

- `node --test --test-concurrency=1 tests/*.test.js tests/*.test.mjs`:324/324.
- `node --test --test-concurrency=1 qa/v2-07b-ts-q1/*.test.mjs`:120/120.
- `node qa/q1-product-audit.cjs`: actual app+SW, synthetic Drive responses,5/5.
  Original code4+one retry → real frame; UI seeks1.2/6.1/0/end/11.95, EOF,
  saved-position/autoplay intent, source drift before MSE, pending close,
  Q1 seek-watchdog failure without Q0 retry, and six cached assets.
- `node qa/q1-lifecycle-audit.cjs`: actual Chrome product lifecycle6/6,
  including held/noncooperative callbacks, true failed cancel and real fetch
  abort. MMS-shaped Chrome subclass is ownership testing, NOT actual iPhone MMS.
- `node qa/q1-preservation-audit.cjs`: native5/5 at0/1.2/6.1/11.95/end.
  Strict zero-diagnostic decode, coded bytes/metadata/absolute clocks, original
  video suffix and all original AAC/same-start PCM agree. Beginning also matches
  uninterrupted full-source PCM. Different uninterrupted decoder histories after
  a seek remain separate, as recorded in prior continuous-seek evidence.
- `node qa/functional-audit.cjs q1-functional`: existing product regression22/22.

The three Q1 reports contain producer hashes in their respective `qa/q1-*`
directories. The earlier QA reports remain historical fixed-producer evidence;
these current product-edge reports do not rewrite those earlier observations.

## Remaining gates and recovery

Priority follow-up: the actual208MB local original passes full-source product
component Chrome16x playback, bounded pause/seek/cleanup, and native all-frame,
coded, absolute-timing and full PCM comparisons. Reports are underqa/q1-priority;
scope and recovery are in memory/Q1-PRIORITY-20260927.md. Original is unchanged.

Not yet verified: current authenticated Drive priority file/version and whole-app
priority playback, physical iPhone Chrome/Safari/PWA, actual audibility/color,
expiry/background long-run behavior, full-format support and total memory.
Current native-first fallback can consume substantial native bytes before TS is
identified; actual priority evidence must guide earlier reusable route discovery.
No claim that 12-second synthetic success closes those gates.

This unit does not deploy, merge, push, mutate originals or enable candidate
Drive writes. Last deployed candidate remains rc.4/3597e63; production v1.21.0
is unchanged. Local recovery: revert this coherent product commit on the work
branch through a new commit, retaining prior QA and user work. Candidate recovery
if later deployed: normal redeployment of the previous committed allowlist/auth
configuration; no cookie purge, appData rewrite or original-media operation.
