# Checkpoint — bounded TS timestamp anchors — 2026-09-26 23:35

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Prior QA6c1604b; last product ced16ef. Bounded arbitrary-aligned TS window scanner now returns only complete PES/NAL/ADTS timing candidates. Input1MiB/PES64KiB/output4096 records; raw33-bit timestamps, safe >4GiB offsets and copied parameter sets.14 scanner tests plus related integration41/41 pass. Independent native packet oracle passes five public windows, full control360 video/six IDRs/564 AAC frames. Independent review found a duplicate-audio blind spot in partial-window oracle; root added strict increasing unique offsets and reran5/5.

Report qa/v2-07b-ts-q1/ts-window-results.redacted.json. These are syntax/timing anchors, not global duration/clock, complete-picture decode or successful seek. Existing worker/MSE72s window evidence remains separate. Priority4MiB strict decode still false; candidate rc.4/3597e63 unauthenticated/mutations locked. No private read, Drive mutation, deployment/merge/push. Product299/299 Node and22/22 browser evidence unchanged.

## Decided

D-050/051/052 unchanged. Browser/PWA direct-original path, free auth-only serverless and full format/device acceptance. Do not wait for a full corpus platform before safe product vertical-slice integration.

## Waiting on the user

No new local decision. Real authenticated Drive/device and operating transition remain separate gates.

## Next first action

Implement bounded time-to-byte/RAP bracketing using complete raw window anchors and the existing identity/generation/budgeted exact Range reader. Head/tail estimates must not be labelled exact global duration/clock proof. Verify local interval decode-start, 10/50/90% actual presented frame and cancellation before product vertical slice. Keep wrap/discontinuity/VFR/long-GOP support open.

## Tried

- Arbitrary packet/PES flush duplicates media; verified IDR/PES boundaries own output.
- Native zero exit may conceal damage; strict decoder stderr required.
- mux.dispose retains cached buffers; reset/drop plus actual worker inspection needed.
- Pause may interrupt pending play; consumer backpressure must pause worker processing watchdog.
- Media error/sourceclose must cancel admission and preserve originating error.
- MSE removal extends to RAP; current proof is two-second GOP only.
- Timestamp windows omit leading/trailing partial records; raw wrap is never silently unwrapped.
- Oracle partial-window counts need unique positions, not only individual native matches.
