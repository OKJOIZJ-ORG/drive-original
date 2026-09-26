# Checkpoint — bounded sparse TS seek candidates — 2026-09-26 23:49

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Prior QA01cc876; last product ced16ef. Browser-safe sparse target/RAP helper uses head/tail/interpolation plus bounded1MiB local expansion, complete local GOP and actual target packet brackets. Common AAC/video source clock retained; duration is sampled-candidate with globalContinuityVerified=false.

Public180s/21,992,052-byte HTTP/native oracle:10/50/90% each match exact RAP and <=one-frame actual packet bracket using3 requests/1,572,432 bytes (7.15%). Nine cases cover identity drift, generation/abort, invalid206 and request limits with no-extra-read counts.12 new tests, related82/82 pass. Independent oracle review clean. Report qa/v2-07b-ts-q1/ts-seek-results.redacted.json. Generated public media cleaned.

Not yet actual decoded/displayed seek or product adoption. Initial audio-only lead and final-frame span without later anchor are explicitly refused, not waived support. Wrap/discontinuity/VFR/long-GOP remain open. Priority4MiB strict decode false; candidate rc.4/3597e63 unauthenticated/mutations locked. No private reads, Drive writes, deployment/merge/push. Product299/299 Node and22/22 browser evidence unchanged.

## Decided

D-050/051/052 unchanged. Direct-original browser/PWA and free auth-only layer; full format/device criteria retained. Integrate safe product vertical slice without waiting for full-corpus platform.

## Waiting on the user

No new local decision. Actual authenticated Drive/device and operating transition are separate gates.

## Next first action

Prepare a bounded self-contained TS decode-start interval around the found RAP using source PSI and unchanged selected PES payloads/timestamps, with enough audio preroll and no partial PES/extra track loss. Verify native coded/timing/metadata and decoded target frames, then actual Chrome10/50/90% rVFC time plus old seekGeneration cancellation. Keep derived packaging distinct from original input identity. Reuse worker/MSE ownership; then wire a product vertical slice, not an all-format QA platform first.

## Tried

- Arbitrary TS cuts duplicate media; complete IDR/PES boundaries own output.
- Zero-exit native decode may conceal errors; strict stderr required.
- reset/drop actual worker and mux owners; pause is not codec failure/watchdog time.
- Sparse90% initial run failed target bracketing despite nearby data. B-picture byte bounds cannot use individual presentation-order rows; bounded expansion and actual following-IDR bracket fix it.
- Preserve validated BoundedProbeError codes through the parser callback.
- Raw33-bit timestamps are not inferred epochs; sampled windows cannot prove unseen global continuity.
- No fabricated EOF endpoint as a real frame anchor.
