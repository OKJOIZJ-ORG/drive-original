# Checkpoint — synthetic GOP boundary discriminator — 2026-09-26

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics. Last product commit ced16ef; prior QA savepoint27409ec. Product Node299/299 and synthetic browser22/22 remain the latest product checks. Candidate stays rc.4/3597e63 with writes disabled, no new deployment.

Q1 QA now differentiates nine incremental scenarios. Six before-IDR fragments preserve the public CFR fixture; arbitrary packet/PES cuts duplicate video, split ADTS changes audio timing and VFR can overlap by20ms. The bounded eligibility gate and unique init-track check reject unproven cases. Independent review fixed cumulative AAC timing tolerance and decoder concealment. Helper17/17 and parser/static/helper80/80 pass.

Correction: the old priority4MiB prefix's equal decoded buffers concealed error-level video decoder diagnostics. Read-only recheck confirmed source and all outputs emit errors despite exit0. Regenerated priority results now have preserved=false in all modes. Coded data/timing/adapted metadata still match; strict lossless playback is NOT proven. Local stat stayed stable and generated private derivatives were removed.

## Decided

- D-050/051/052 unchanged: direct original bytes and separate minimal B-auth; no merge/push/production replacement, original mutation, billing or automation restart.
- mux.js remains QA-only, not an adopted product dependency. Reject decoder diagnostics and uncertain framing/timing; unsupported-by-this-gate does not mean product acceptance is waived.
- Preserve current proof distinctions: structural eligibility, error-free decode, incremental runtime, indexed seek and physical-device acceptance are separate.

## Waiting on the user

No new local-work decision. Current isolated candidate is unauthenticated. Live Google/device checks and eventual production approval stay separate user-controlled gates, not blockers for independent local work.

## Next first action

Inspect qa/v2-07b-ts-q1/gop-boundaries.mjs and build a bounded streaming GOP/PES lookahead owner against the public synthetic fixture, proving incremental release/retained-byte limits before product integration or seek.

## Tried

- Fixed TS byte chunks, arbitrary PES counts and IDR-first-packet flushes duplicate video; only before-IDR cuts preserve the CFR control.
- Before-IDR alone is insufficient: partial ADTS, VFR durations and absent audio have concrete counterexamples.
- Per-PES one-tick AAC tolerance accumulated drift; use one origin and cumulative sample count.
- FFmpeg exit0 plus matching decoded buffers allowed concealment; both source/output error diagnostics now force preserved=false.
- The4MiB priority cut is not a complete-picture decode fixture; use independently complete bounded GOP data before any strict priority-Q1 claim.
- Rollback is removal of QA-only candidate files; product/candidate and original need no remote recovery.
