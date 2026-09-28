# Actual format and seek discriminants — rc.11

This is preserved real-account desktop Chrome evidence from the unchanged
candidate `b9d873926e894bb89a9faa8e638f7f0a80c0eb7e`, app/SW `1.22.0-rc.11`.
Results contain aggregate media properties, timings and errors; private names,
IDs, account identifiers and credentials are omitted. Normal player actions were
used for playback, seek, resume and close. Developer observers were bounded and
released. Volume/output settings were untouched.

- WebM: direct original Range playback, midpoint seek, resume, EOF and settled
  close pass for one 318,571-byte, 3.938-second file.
- Largest current ISO selection: 4,607,107,537-byte MP4, AVC/AAC, 1920×1080.
  First decoded frame appears at 2.5 seconds before the whole source is read.
  The 10% seek passes. The 50% and 90% seeks falsely invoke recovery while native
  frames and decoded audio continue; these are retained failures.
- A passive repeat proves the first post-seek frame arrives about 886ms after
  `seeked`, agrees with contemporaneous `currentTime`, and has moved beyond the
  old fixed 250ms target window. This discriminates the local seek fix described
  in `seek-watchdog-fix.md`; it is not post-fix candidate acceptance.
- Smallest declared MKV and AVI both have bounded actual TS structures and fail
  before decoding at `SEEK_VIDEO_CLOCK_UNPROVEN`. Separate identity-fenced head/
  tail reads discriminate a 5-tick phase shift and rational 21fps intervals
  (4285/4286 ticks), respectively. Both source jobs settle and release local
  references. Generic upstream retirement is unknown; local source cleanup is
  not relabeled as Q1 SW retirement.

Exact executed producers are saved beside their results. The clock diagnostic
producer/facade and their provenance are in `../v2-07b-ts-q1/clock-*`.
`node qa/v2-live-format-playback-rc11/validate.mjs` validates eight consequential
outcome checks and saves hashes of the leaf's evidence. Its success means the
preserved evidence is internally consistent, not that its failed rows pass.
This does not prove other files/codecs, complete long playback, audible output,
physical Android/iPhone/PWA behavior, background return or final release quality.
