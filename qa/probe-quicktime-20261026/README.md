# "원본 형식 확인 필요" during playback — D111 (2026-10-26)

User report: `x_20260820_5e365a54.mov` plays for a few seconds, then the dialog
"원본 형식 확인 필요 / 원본 형식을 안전하게 확인하지 못했습니다" stops it.

## Root cause (confirmed, actual Chrome on production 1.23.15)

The dialog has one source: `planPinnedOriginalAudio` (app/playback-source.js), the
optional Q2 audio probe that runs beside an already playing Q0 original.

- Trace: Q0 `original-range` playing from 2.98 s, then at 9.31 s `q1-failed`
  reason `GENERAL_BOX_HEADER`, terminal → playback cleared, dialog shown.
- The file is well formed (`ftyp 20 · wide 8 · mdat 18080102 · moov 13653`, sums to
  the Drive size). Inside moov, the avc1 sample entry's extension list
  (`avcC colr fiel chrm`) ends with a 4-byte zero: the QuickTime atom-list
  terminator. `inspectGeneralMoov` read those 4 bytes as a truncated box header.
- The next blocker in the same file: its `mp4a` uses a QuickTime sound description
  version 1 (16 extra bytes), which admission rejected as
  `GENERAL_AUDIO_DESCRIPTION_UNQUALIFIED`, also terminal in the app.

## Library survey (actual Drive, read-only, same folder + liked items)

Admission over each file's moov, before → after the patch (1122 ISO/QuickTime videos):

| Verdict | Before | After | App effect |
|---|---|---|---|
| OK | 1000 | 1030 | |
| `GENERAL_BOX_HEADER` (QuickTime terminator) | 12 | 0 | was terminal |
| `GENERAL_AUDIO_DESCRIPTION_UNQUALIFIED` (sound description v1) | 18 | 0 | was terminal |
| `GENERAL_CODEC_UNQUALIFIED` | 50 | 50 | native kept |
| moov missing in 64 boxes or > 4 MiB | 37 | 37 | native kept (limit / fragmented) |
| `GENERAL_EXPANDED_INDEX_LIMIT` | 3 | 3 | native kept |
| `GENERAL_ISO_FEATURE_UNQUALIFIED` | 2 | 2 | native kept |

So 30 of 1122 (2.7 %) would have shown this dialog; after the patch 0.

Full `probePinnedGeneralAudio` (patched admission/tracks/timeline linked into the
production module graph) over 400 of them: 235 native-audio-track, 160
track-count-unqualified, 4 q2-codec-unqualified, 1 `GENERAL_MOOV_LIMIT`
(native kept). No terminal outcome.

End-to-end: the patched planner and modules injected into the production tab;
`x_20260820_5e365a54.mov` played `original-range` to its end (15.67 s), no
`q1-failed`, no dialog.

## Changes

- `media/general-admission.mjs`: a 4-byte zero list terminator ends a box list;
  QuickTime sound descriptions v1/v2 (52/72-byte fixed part) are admitted, their
  extensions are not walked (left to the demuxer); other versions stay unqualified.
- `media/general-tracks.mjs`, `general-timeline.mjs`, `subtitle-track.mjs`: same
  terminator rule; track/subtitle top-level walks accept < 8 zero padding bytes at EOF.
- `app/playback-source.js`: probe verdicts are classified. Budget limits and every
  `GENERAL_*_UNQUALIFIED` (supported-subset boundary, except the raster
  image-header check) keep native Q0. Dropped reads (`GENERAL_READ_TIMEOUT`,
  `READ_BODY`, `READ_QUEUE_LIMIT`, `Q1_SOURCE_READ_FAILED`, `HTTP_UNAVAILABLE`)
  retry once on a fresh source after 400 ms. Malformed input, content drift,
  permission, AC-3 gate and uncertain cleanup stay terminal, with a message that
  names the actual cause (only uncertain cleanup still says "앱을 새로 연 뒤").

Not changed: `media/video-q3-input.mjs` has the same terminator weakness but is
license-pinned (licenses/video-q3-source-manifest.json) and only used by the Q3
software-decode route, which does not raise this dialog.

Tests: 1000/1000 (`node --test tests/*.test.js tests/*.test.mjs`), 12 of them new for D111.
