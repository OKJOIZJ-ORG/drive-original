# Checkpoint — source-bound Q1 init adaptation — 2026-09-26 22:35

## The story so far

Repo C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics. Last product ced16ef; prior QA d249f76. First TS interval now supplies copied source SPS/PPS and PSI video ID. Browser-safe init adapter validates exact parameters/track/geometry; absent/IDC0 removes only4 pasp type bytes, explicit square stays unchanged.

Tests171/171 pass. Four public complete-clip/chunking runs prove raw absent-SAR metadata failure becomes coded/timing/metadata/strict-decoded equality; reports pin final producers. Independent adapter tests and root-wiring/driver review clean. This is QA-only, not yet browser playback, worker or indexed seek. Product checks299/299 and browser22/22 remain unchanged; candidate rc.4/3597e63 is unauthenticated and mutation-locked. Priority arbitrary4MiB strict decode remains failed (source and output diagnostics), not proof of full original corruption.

## Decided

- D-050/051/052 unchanged. No original mutation, deployment, push/merge or billing.
- Non-square/reserved/zero Extended SAR is unfinished geometry work, not excluded acceptance.
- Source binding and strict native QA do not prove actual browser/device display.

## Waiting on the user

No new local decision. Authenticated account/device gates and eventual production approval remain separate.

## Next first action

Add a local-only browser MSE driver under qa/v2-07b-ts-q1 using createGopStream and adaptInitSar, with a held source tail and bounded append acknowledgment; require a real decoded frame before releasing the complete input.

## Tried

- Arbitrary packet/PES flushes duplicate video; initial path requires validated CFR/GOP and complete ADTS.
- Equal concealed decode buffers cannot prove preservation; error-level FFmpeg diagnostics fail.
- SAR metadata alone is insufficient: bind source parameters and coded geometry before changing init.
- mux uses coded width in tkhd even for non-square SAR; display geometry needs separate proof before admission.
- Source configuration is copied only on first interval; consumer mutations must not alter later source comparisons.
- Rollback removes only QA units. No remote/original/product recovery needed.
