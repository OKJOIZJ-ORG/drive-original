# Checkpoint — dedicated-worker ACK ownership — 2026-09-26 23:05

## The story so far

Repo C:/extensions/Drive-Original/source; branch codex/v2-kickoff-diagnostics. Last product ced16ef; prior QA4e49b77. QA Worker now streams original-byte-derived fragments to real Chrome MSE before EOF with one64KiB input and one output credit. Matching ACK is required before more parsing. Six worker trials pass; actual worker inspection stays unchanged with ACK held, release completes and abort clears ownership. Main baseline5/5 refreshed; related parser/Q1/static/browser-adapter integration190/190.

Evidence: qa/v2-07b-ts-q1/worker-results.redacted.json, README.md, transmux-session.test.mjs and worker-client.test.mjs. Actual mux GOP backing peak1,384,052 bytes, worker encoded owner849,424, terminal reset/dispose to zero; NOT total heap/decoder/MSE measurement. Review closed ACK-post rejection, main-counter-only proof and cancelled-EOF terminal-in-transit race.

Priority arbitrary4MiB prefix still has strict decoder diagnostics; no priority success claim. Candidate rc.4/3597e63 unchanged, unauthenticated and mutations locked. Last product checks299/299 Node and22/22 browser remain separate. No app deployment or private source access in this unit.

## Decided

D-050/051/052 unchanged: preserve full acceptance, direct-original browser/PWA and separate auth serverless. No originals/production/push/merge/billing/paused-automation actions.

## Waiting on the user

No new local decision. Authenticated Drive/device and operating-transition gates remain separate; independent approved work proceeds.

## Next first action

Implement and discriminate sustained MSE forward-buffer admission plus backward eviction on public continuous TS through the current worker, proving bounded retained timeline and cancellation while waiting. Then bounded duration/time-to-byte indexed seek and product integration. Do not claim duration/full-format/device support from short synthetic first-frame proof.

## Tried

- Arbitrary packet/PES cuts duplicate frames; initial CFR/complete ADTS constraints remain.
- EOF-only needs full input; held-tail control distinguishes incremental playback.
- updateend alone is insufficient; require successful update and no error.
- mux.dispose alone retains media; reset first and release all owners.
- Main reported consumption cannot prove worker pause; inspect real session state.
- Abort can race a terminal response; preserve cleanup without reviving cancelled success.
- Non-square SAR, VFR/cross-PES ADTS, other formats and priority strict proof remain open.
