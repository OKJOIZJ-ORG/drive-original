# Checkpoint — bounded sustained MSE window — 2026-09-26 23:23

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Prior QA21d9df8; last product ced16ef. QA source-bound worker/MSE now has sequential exact64KiB Range admission plus6/4-second forward hysteresis and backward removal.72s/8,795,392-byte synthetic clip completes36 fragments/135 requests and ends at verified4x. Actual worker and server counters stay unchanged during16.1-second pause. Buffered peak7.852s ahead/14.080s total,29 removals; unbounded control retains72.021s.

Six window trials pass, including cancellation, injected removal/media error and response-ETag mismatch. Native strict comparison preserves2160 video frames/full PCM/encoded content/timing/metadata. Scoped42/42; refreshed browser baseline5/5 and worker6/6. Report: qa/v2-07b-ts-q1/window-results.redacted.json. This is not total heap, long actual Drive/device, general GOP or indexed-seek acceptance.

Priority4MiB prefix still has decoder diagnostics and strict preservation false. Candidate rc.4/3597e63 unchanged, unauthenticated, mutations locked. Product299/299 Node and22/22 browser evidence is separate. No private media, Drive writes, deployment, merge or push.

## Decided

D-050/051/052 unchanged. Direct-original browser/PWA, auth-only free serverless, all full-format/device acceptance retained. Bounds are explicit proof slices, not waived formats. Integrate a vertical product slice once safe duration/indexed seek is proven; do not build the full corpus platform first.

## Waiting on the user

No new local decision. Real authenticated Drive/device and operating transition remain separate gates.

## Next first action

Read current GOP boundary/elementary APIs and existing exact identity/range reader. Build a bounded TS duration/time-to-byte/keyframe probe that does not consume from zero to target or invent file duration from prefix. Verify10/50/90% target location and generation cancellation on public media before product integration. Preserve wrap/discontinuity/VFR/long-GOP unknowns explicitly.

## Tried

- Arbitrary packet/PES flushes duplicate media; verified IDR/PES boundary owns output.
- Native zero exit may conceal damage; strict decoder stderr is required.
- mux.dispose alone retains GOP bytes; reset and drop owners.
- Main counters cannot prove worker pause; inspect actual worker session.
- Pause can interrupt pending play normally; consumer wait cannot consume worker watchdog.
- Media error/sourceclose must cancel a held admission; preserve originating fixed error.
- QA playbackRate resets on load unless default rate is set; assert actual rate.
- MSE removal can extend to next RAP; only tested two-second-GOP configuration is admitted here.
