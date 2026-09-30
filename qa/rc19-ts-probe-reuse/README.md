# rc19: reuse admitted TS probe input within one source generation

Observed actual rc18 trusted paused50% target frame took13.3749s, with15metadata
and7Range requests totaling12.4699s before that frame. That safe actual record
remains unchanged under `qa/rc18-priority-latency`. This unit fixes one concrete
part of that serial path, without claiming actual-account latency improvement.
Immutable baseline public source: `f6749c1a1b1a8345f8f76606786e0c1ccb48b21c`.
Root's later evidence-only HEAD does not change this baseline.

## Change and retained contracts

`probeTsSeek` has an optional synchronous `onInput` consumer after all discovery
admission. Its returned plan stays metadata-only. For that consumer alone,
owned copies of admitted windows survive until callback delivery; the head and
selected window can immediately construct `createSeekBootstrap`. All local
window byte references and cache entries are released in `finally`, on success,
probe failure or consumer failure. An async/non-undefined consumer result fails
closed. No shared/global/returned-plan cache or cross-seek reuse exists.

Retention is bounded by existing discovery caps: each window≤1MiB and≤16windows,
default12. The additional temporary raw window retention is therefore≤16MiB
(default≤12MiB), independent of original file size. Bootstrap retains its existing
owned bounded prefix/bindings; it does not retain these raw window arrays. Native
total memory is not inferred from this source bound or JS heap.

`media/ts-player.mjs` consumes that input only with a current generation and the
same `reader` object used at discovery start. An observed503 may replace that
optimistic source. In that case, the player discards reuse and performs the
original fresh head/chosen-window reads with every existing pre/post metadata
fence. New playback suffix bytes always use the original reader checks. No
permission, account/revision/checksum, generation, retry-budget, retirement,
timestamp, byte-quality or original-source fence was relaxed.

Only `qa/v2-07b-ts-q1/ts-seek.mjs`, `media/ts-player.mjs`, generated
`media/q1-core.mjs` and `media/build.json` change product/source behavior.
`scripts/build-q1.cjs` uses the existing pinned compiler0.28.1 and mux7.1.0.
Transmux worker, mux artifact and license bytes remain equal to baseline.
No codec/general pipeline/preferred-source archive changes are needed: their
runtime/corresponding-source bytes are unchanged. The modified canonical
TS probe remains the recorded source input of `media/build.json`; root owns
candidate version/public/cache/package/source-manifest delivery checks.

## Reproduce and focused correctness

`record-baseline.mjs` executed the actual unchanged product source/probe/bootstrap
against the tracked synthetic B-frame/audio-leading TS. `baseline.json` records
4Range/9metadata before bootstrap's MSE boundary:2Range/4metadata are duplicate
head/chosen-window reads. The deliberate MSE constructor stop is a QA boundary,
not a decode failure. `boundary-harness.mjs` uses the actual Drive source reader
and current generated core, with no browser, network or product script rewrite.

The modified same-reader route reaches that boundary with2Range/5metadata.
Reader-replacement503 control retains5Range/11metadata including failed attempt
and original fallback reads. Permission/content drift/cancel exposes no input
or MSE, and cleanup settles. Bootstrap output is byte-identical to the original
fresh-input control, including all source PES/timestamp and continuity rules.
Separate probes reread; returned plans contain no raw input arrays.

The original executed regression producer is preserved byte-for-byte as
`reuse-executed-first.mjs` (execution path was `reuse.test.mjs`). Maintained
regressions now live at `tests/q1-probe-reuse.test.mjs`, with only import paths
changed and6/6passed once. This avoids duplicate *.test discovery in the QA leaf.

Focused43/43passed: new6 +existing `ts-seek.test.mjs`13,
`seek-bootstrap.test.mjs`13 and `seek-input.test.mjs`11. No full suite was run
by this child; root owns integration/fullsuite/actual replay.

## Native app/SW qualification and all attempts

Chrome DevTools MCP first returned its shared anonymous-profile running conflict.
The previously authorized installed isolated Chrome fallback was used, with no
personal browser attachment or global/OS/volume changes. `native-adapter.cjs`
reuses the maintained `qa/q1-product-audit.cjs` provider/server and actual app/SW
case, writes exact adapted `native-driver.cjs`, and runs only `early-to-q1`.
All Google-facing routes are synthetic; no original account/media is accessed.

1. First attempt failed in the old QA server's missing `.wasm` Content-Type
   mapping before media playback. Exact adapter/driver and
   `native-first-mime-failure.json` are preserved. The fatal Node exit lost its
   PID observations; first-attempt browser closure was not directly measured.
2. `native-2026-09-30T01-27-54-720Z.json` timed out with0provider requests because
   the adapter's synthetic capability replacement hit the inactive50-cycle
   branch. Exact second adapter/driver are preserved. Browser/server close and
   unchanged public SHA are recorded. This is an explained harness failure,
   not evidence of a product source failure.
3. `native-2026-09-30T01-30-57-047Z.json` passed on Chrome154.0.8037.58 after
   current-case capability/MIME/cache assumptions were corrected in QA only.
   Initial generation and5paused seeks (1.2s/6.1s/zero/clamped1000s/11.95s) reused
   admitted input and presented native target frames within unchanged
   1/30+.0001s tolerance. Native ends, app/SW retirement settles and src is absent.
   All51public assets have equal before/after SHA. Browser/server closed.

Observed host minimum at successful samples:1.800GiB available commit and
2.447GiB physical, above stop gates1.5/1.0GiB. Owned Chrome private memory was
sampled before each seek and close (peak sampled567.85MiB); this short run with
the maintained Network observer is not a native ceiling/plateau proof.
Read-only process inventory after failure cleanup and after success found no
browser roots matching this launcher's Playwright temporary chromiumdev profile
plus remote-debugging-pipe, and no exact adapter Node process. Personal/MCP
processes were never stopped. `qa-process-cleanup.json` records the observation
and first-attempt attribution limit.

This unit does not establish actual Google latency p95, upstream timing,
long-duration Q1, physical-device/audibility or global memory acceptance.
Root owns rc19 version metadata, independent integration review, full suite,
actual-account replay, candidate delivery and savepoint. QA/source/test hashes
and exact curated paths are in `evidence-manifest.json`/`curated-savepoint.txt`.
