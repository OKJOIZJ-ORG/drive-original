# V2-07A bounded MPEG-TS container probe

This local-only QA unit parses caller-supplied bytes with `probeMpegTs(input, options)` from `mpeg-ts-probe.mjs`. It has no browser, Drive, network, decode, playback, mutation, persistence, deployment, or private-identity path.

The parser requires at least three aligned 188-byte TS packets, performs bounded resynchronization, and accepts PAT/PMT topology only after CRC-valid, current, complete section sets. It handles pointer/adaptation fields, payload continuity, discontinuities, identical duplicates, multiple programs, PCR PIDs, elementary PIDs, and conservative stream-type codec families. A second bounded stage may extract H.264 profile/level/dimensions/color from an observed Annex-B SPS and AAC object type/sample rate/channels from an observed ADTS header. Missing, split, truncated, unsupported, or malformed evidence remains explicit; MIME and filename are never inputs.

Default hard limits are 4 MiB, 16,384 packets, 6,016 resynchronization bytes, 1,024 bytes per PSI section, 256 examined sections, 64 programs, 64 streams per program, 256 total streams, 64 KiB of elementary payload per stream, and 128 reported issues. Options may only lower or raise these values within the module's absolute caps. A final partial TS packet in a deliberately bounded prefix is counted and ignored; an in-progress recognized PSI section is `truncated`.

The structured local result includes program/packet identifiers and codec fields, but no file name, Drive ID, URL, account, token, raw media bytes, or payload excerpt. Keep this detailed result private for real media; only the separately reviewed browser adapter may publish aggregate counters. Status is one of `complete`, `incomplete`, `truncated`, `malformed`, `unsupported`, `limit-exceeded`, or `not-mpeg-ts`. `complete` describes PAT/PMT topology, not whole-file or elementary-stream validity; every `codecDetails.status` remains an independent evidence gate.

Codec-detail confirmation requires a complete observed ADTS frame or SPS (including VUI remainder and RBSP stop/alignment), not merely the desired prefix fields. Unexpected elementary continuity loss remains inconclusive for the run, even after a later PUSI. Declared discontinuity starts a fresh segment and discards previously accumulated bytes instead of joining unrelated fragments. These are conservative probe evidence rules, not a decoder/conformance validator. Syntax cross-checks: [FFmpeg H.264 parameter sets](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/h264_ps.c) and [ADTS header](https://github.com/FFmpeg/FFmpeg/blob/master/libavcodec/adts_header.c) (2026-09-26); no FFmpeg code or dependency is bundled.

Run the deterministic synthetic suite with:

```powershell
node --test qa/v2-07a-container-probe/mpeg-ts-probe.test.mjs
```

The suite does not prove whole-file integrity, duration, seek indexes, keyframes, decode, audio output, playback, device/browser compatibility, real Drive/CORS behavior, or support for 192/204-byte TS variants, ISO-BMFF, HEVC elementary headers, private-stream descriptors, subtitles, or formats outside this MPEG-TS slice.

`results.redacted.json` records a 2026-09-26 read-only local prefix observation on the designated priority sample: exactly 65,536 bytes read with `fs.open(..., 'r')`/position-zero bounded `read`, closed in `finally`, and private `stat(..., { bigint: true })` fields compared before/after. The final parser hash identifies the exact observed implementation. No filename, path, Drive ID/version, hash of the media, or raw body is persisted. Repeating this requires the privately supplied source path, not a guessed path or public asset.
