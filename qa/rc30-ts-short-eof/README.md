# Short true-EOF TS GOP correction

Actual rc29 bounded evidence is owned by
`../rc29-resume-20261001/actual-ts-gop-diagnostic-safe.json`: the failed normal UI
file had a final singleton IDR; strict syntax, DTS, unique PTS, reorder and IDR
presentation conditions passed. The canonical three-frame GOP condition rejected
startup. That private media was neither copied here nor supplied to this agent.

The correction retains short GOPs only at exact source EOF. A singleton's
duration is inferred from the observed adjacent preceding DTS interval, never
from an assumed frame grid or invented picture. End seeks keep the preceding
validated GOP as original-byte decoder preroll, so the worker establishes its
cadence from actual input. Shared grouping is revalidated during seek input
preparation. All source-clock, PSI, parameter, transport, audio, identity-owner,
read-budget and sample/byte caps remain in force.

A singleton final IDR also exposed two synchronous emissions during EOF, which
violated the session's single output credit. The stream owner now emits that
already-bounded predecessor-plus-singleton interval once. Two-frame final GOPs
retain their observed final decode interval. No worker clock hint or additional
external protocol field is needed. A terminal short GOP without enough bounded
preceding evidence remains unproven; no scan budget is enlarged.

Local verification:

- `node scripts/build-q1.cjs` rebuilt the canonical public core and worker.
- `node --test qa/v2-07b-ts-q1/*.test.mjs qa/rc30-ts-short-eof/short-eof.test.mjs`:
  **141/141 passed**, including rational/VFR original-clock preservation,
  transport/clock/PSI/input mutation guards, EOF truth, byte limits, output
  credits, cancellation, resource cleanup and short EOF startup/end suffixes.
- `node qa/rc30-ts-short-eof/preservation.mjs`: native FFmpeg decoded the public
  synthetic 301/302-frame TS and emitted MP4 streams with zero error diagnostics;
  decoded frames and PCM match, H.264 VCL/SPS/PPS/AAC bytes match, source PTS/DTS
  match, and final duration equals the observed adjacent DTS interval.
- `node qa/rc30-ts-short-eof/baseline.mjs`: fixed rc29 public core rejects all four
  1/2-frame startup/end cases; the rebuilt public core passes the same inputs.

Generated TS/MP4 files contain only the existing public synthetic test pattern.
They are reproducible local decoder artifacts, not actual-account evidence.
No browser/device playback, user media byte comparison, deployment or same-file
candidate30 acceptance is claimed. Root owns integration, independent review,
candidate identity and actual PC/Android follow-up. Frozen rc29 diagnostics are
unchanged.
