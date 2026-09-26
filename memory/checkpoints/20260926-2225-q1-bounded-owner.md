# Checkpoint — bounded incremental TS owner — 2026-09-26

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics. Last product commit ced16ef; prior QA6d01ed3. Product Node299/299 and browser22/22 remain the last product integration checks. Candidate rc.4/3597e63 and mutation lock are unchanged.

QA-only incremental PSI/PES/GOP owner now emits exact raw intervals before EOF and releases its bounded storage. Six chunk sizes preserve the exact verified mux output; first callback uses164,500–196,608 of958,800 synthetic bytes. Raw retained peak177,472; conservative encoded-byte accounting387,328 excludes JS heap, harness retention, mux cache and decoder/worker/MSE.21 new tests plus prior checks pass101/101. Independent review closed callback-generation, Promise, SPS and evidence-binding defects. Fixed reports pin the actual library, fixture, source chain and strict-positive output hash.

Priority strict decode remains OPEN: arbitrary4MiB input/output both produce decoder errors despite equal concealed buffers. Current priority report correctly has preserved=false. Earlier local stat was stable and generated private derivatives were removed; this latest owner unit did not read private media.

## Decided

- D-050/051/052 unchanged: direct Drive bytes and separate minimal B-auth. No original mutation, push/merge/production replacement, billing or automation restart.
- Current stream code is QA-only, not shipped/adopted product support. Initial admission is CFR/H264/complete ADTS with fixed topology; other formats remain acceptance work.
- Source syntax, strict decoder success, owner memory bounds, total pipeline memory, browser rendering and device acceptance are separate evidence levels.

## Waiting on the user

No new local decision. Current isolated candidate is unauthenticated; actual Google/device acceptance and eventual production approval remain separate gates.

## Next first action

Inspect parseH264Vui in qa/v2-07a-container-probe/mpeg-ts-probe.mjs and add tested absent/explicit/extended SPS aspect-ratio metadata for browser-safe SAR eligibility without FFprobe.

## Tried

- Arbitrary packet/PES and one-packet-into-IDR flushes duplicate video.
- IDR alone is insufficient: cross-PES ADTS, VFR duration and delayed audio have maintained counterexamples.
- Per-PES timestamp tolerance accumulates drift; use the global AAC sample clock.
- Equal FFmpeg buffers plus exit0 can conceal corruption; any error-level diagnostic forbids preservation.
- User callbacks can abort/change generation; recheck after every callback and reject/drain async results.
- PSI family declarations do not validate SPS; reuse the bounded SPS syntax parser.
- Rollback removes only the QA candidate; no original/remote/product recovery is required.
