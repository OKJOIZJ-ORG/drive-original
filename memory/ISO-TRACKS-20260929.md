# Large ISO sparse track discriminator — 2026-09-29

**Observed actual:** the largest current ISO selection is 4,607,107,537 bytes;
its front moov is 23,452,114 bytes. The initial whole-moov parser rejects it at
the existing 2MiB cap after three media requests/956 bytes. That failure and exact
initial bundle are preserved rather than removed or called source corruption.

**Implemented QA-only:** sparse metadata traversal skips sample tables and reads
only bounded required track/description fields. Caps stay 64 media requests,
2MiB+8192 bytes, serial reads and the existing time/identity/cancellation limits.
Derived compact metadata is not a full original moov or validity/decoder verdict.

**Verified locally:** 30/30 parser/probe/sparse tests pass; independent synthetic
seed ffprobe compares track tags, dimensions, sample rate and channels.

**Observed actual rerun:** 38 media GETs/1375 bytes and two metadata GETs/790 bytes,
62 logical sparse reads/837 bytes, 43 headers and 12 skipped tables. The derived
701-byte metadata has AVC1920×1080 with identity matrix and AAC2ch48kHz. Pre/post
content identity agrees, metadata bodies reach EOF and local references release.
Fresh active-controller proof was acquired. Generic upstream retirement remains
unknown. The separately recorded normal player first-frame/seek evidence does
not promote this metadata probe into playback proof.

Owner: `qa/v2-07a-iso-tracks-rc11/README.md`, original and sparse producer bundles,
provenance and exact redacted live results. Sample tables, full configurations,
HDR/VFR/subtitles, other files and physical devices are unqualified. No source
media, candidate runtime, authentication grants or volume setting changed.
