# Original-clock Q1 extension — 2026-09-29

Status: locally implemented and verified; actual candidate playback after this
change remains the root's next check. No deployment, browser action, commit,
reencoding, original-file write or app/auth/UI/version edit occurred in this unit.

## Actual discriminator

Root evidence: `qa/v2-live-format-playback-rc11/mkv-clock-results.json` and
`avi-clock-results.json`. Both probes completed two media reads (1,048,288 bytes),
five metadata reads, and settled local Source cleanup. Generic upstream cleanup
remains unknown. Declared MIME is not actual container evidence.

- MKV-declared actual TS: head and tail DTS intervals are 3003. Tail's common
  DTS/PTS phase differs from head by 5 ticks; the old global-grid test rejects it.
- AVI-declared actual TS: rational 21fps produces 4285/4286 DTS intervals. The
  old integer-CFR test rejects even the head. Earlier inference that two completed
  range requests proved head clock admission was unjustified and is withdrawn.

## Responsible changes

`video-clock.mjs` validates observed timestamps instead of snapping them to a
single integer frame grid. DTS must increase by 1–90000 ticks, PTS must be unique
and remain within the existing 16-reference-interval reorder bound, and complete
GOP presentation must start at its IDR and not overlap an adjacent GOP. Large
intervals, regression, wrap, explicit TS discontinuity, transport continuity,
PES/config changes and all existing resource/identity/cancellation caps still
fail closed. Unsampled continuity is still unproven. A small unflagged valid
timestamp variation cannot be classified as corruption from magnitude alone.

The seek probe uses actual before/after frame anchors and following IDR time.
Bootstrap independently revalidates the chosen source samples. Streaming uses
the same clock validator. EOF retains an explicitly inferred duration from the
last observed decode interval; this never creates a seek/frame anchor.

Existing `incremental-probe.cjs` contains a useful negative discriminator:
unmodified mux.js can assign its last fragment sample the prior duration and
create overlap at a VFR boundary. `fragment-clock.mjs` therefore validates every
output video's DTS/PTS against its source samples before exposure, and binds the
last sample duration to the observed next DTS. At EOF it uses the explicit final
interval estimate. It parses only the pinned mux fragment layout with strict
box/sample counts and limits. It edits that duration field only: media payload,
PES timestamps, composition offsets, track selection and audio remain unchanged.

## Verification

- `node --test --test-concurrency=1 qa/v2-07b-ts-q1/*.test.mjs`: **133/133 pass**.
- New preservation tests cover common 5-tick phase shifts, alternating rational
  21fps, and the previously failing VFR fragment boundary. At 10/50/90% they
  exercise seek plans and bootstrap. Real pinned mux output is checked using
  independent ffprobe timestamps: every DTS/PTS matches the source and each
  nonfinal sample duration equals the next actual source DTS difference.
  H264 VCL/parameter sets and AAC payload comparisons pass; native decoded frame
  hashes and PCM match the public synthetic input. This is not live-device proof.
- Malformed clocks, overlapping GOPs, corrupted mux timestamps/sample counts,
  transport/parser limits, ACK backpressure, ownership, abort and cleanup tests
  remain discriminating. Original CFR output bytes still match the old baseline.
- `node scripts/build-q1.cjs` regenerated public bundles with existing pinned
  compiler/library. Producers use LF bytes to match Git normalization.
- `node --test tests/static.test.js`: **20/20 pass**, including exact bundle/input
  manifest checks. Root owns full product-suite integration and live candidate.

Public hashes:

```
media/q1-core.mjs        479ed5710a820a6707581a8e4b7ac47d960da861ba18c868ba5ebe7afaab2080
media/transmux-worker.mjs 8dda58e2b0b36e977428846d6bd2c2c9a27d932f430e45afb283c2bf8d378605
media/build.json          8a5ea262c8738f4aa8c64ecae04772c8117895fe7f889e59346697ab8e2d50af
```

New canonical files under ignored QA need explicit staging:
`video-clock.mjs`, `fragment-clock.mjs`, `video-clock.test.mjs`,
`clock-preservation.test.mjs`. Do not omit the producer modules named by the
public build manifest. Diagnostic artifacts remain separate from shipping code.
