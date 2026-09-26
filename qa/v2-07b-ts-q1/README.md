# Bounded Q1 preservation discriminator

QA only. This is not a product transmux/seek path and does not add a runtime
dependency to the published app. The exact executed artifact is mux.js7.1.0
`dist/mux-mp4.min.js`, SHA-256
`4d00d911c3186ca8921b8710de24cf4c4ea854e47c59d3c5164779ba83a2805f`.
The package lock and report pin the artifact, probe and SAR adapter. Use
`npm ci --ignore-scripts --no-audit --no-fund` in this directory to restore it.
FFmpeg/FFprobe9.0.1 and Node are local QA tools, not servers or product dependencies.

## Reproduce

`node --test --test-concurrency=1 preservation-probe.test.cjs`

`node preservation-probe.cjs synthetic-bframes-audiolead.ts synthetic`

The optional private-source command takes an explicitly authorized read-only
local path followed by `priority-prefix`. It reads at most4MiB and never publishes
the path, media or private content hashes. Each fresh run uses an ignored `run-*`
directory; exact generated TS/MP4 files are removed even after partial-write
failure. Redacted JSON remains. Do not serve or commit private derivatives.

The synthetic958800-byte TS is FFmpeg-generated testsrc2+sine, not user media.
SHA-256 `e05388c5f61b181710145a414443938e8065dd08e77e01c0aec0ffd0b73229e4`.
Generation uses `-n` and one video encoder thread:

```text
ffmpeg -v error -hide_banner -nostdin -n
  -f lavfi -i testsrc2=size=360x640:rate=30:duration=12
  -f lavfi -i sine=frequency=880:sample_rate=48000:duration=12
  -map 0:v:0 -map 1:a:0 -c:v libx264 -profile:v high -level:v 3.0
  -pix_fmt yuv420p -color_primaries bt709 -color_trc bt709
  -colorspace bt709 -color_range tv -g 60 -bf 2
  -x264-params aud=1:repeat-headers=1 -threads 1 -crf 29
  -af asetpts=PTS-0.25/TB -c:a aac -ac 2 -b:a 96k
  -f mpegts synthetic-bframes-audiolead.ts
```

## What the discriminator proved

- Default options dropped10/564 AAC frames in the synthetic audio-leading clip.
  `keepOriginalTimestamps:true` preserved all360 video VCL units,564 AAC payloads,
  parameter sets/SEI, normalized PTS/DTS/duration and stream metadata.
- The priority file's local4MiB prefix preserved1022 VCL units and1586 AAC frames,
  but mux.js introduced1:1 `pasp` where source SAR was unspecified. That result
  correctly failed strict metadata comparison rather than being called Q1.
- Only after independent metadata confirmed unspecified SAR, the small structural
  adapter changed that introduced square `pasp` box type to `free`. Size, offsets,
  SPS and all media bytes stayed unchanged. Non-square/duplicate/malformed boxes
  are rejected. The resulting priority-prefix metadata, timestamps, compressed
  payloads and complete FFmpeg-decoded frame/PCM buffers matched. Early/mid/late
  ordinal windows also match, but are not seek tests.
- Nine helper tests discriminate byte/metadata/timing changes, stale packaging,
  malformed input, unsafe chunk sizes, partial-write cleanup and CLI redaction.

The earlier decode-window draft used container-relative FFmpeg `-ss`, which
introduced different origin/rounding cuts despite identical packet timestamps.
It was replaced with one full bounded decode and ordinal windows; timing remains
an independent all-packet comparison. Do not use the superseded run reports as
evidence of pixel corruption.

## Explicit limits / next required unit

The entire4MiB sample is pushed in chunks but flushed only once at EOF. This
does not prove arbitrary flush boundaries, uninterrupted incremental playback,
bounded time-to-byte/keyframe seek, duration discovery,33-bit wrap/discontinuity,
native MSE/ManagedMediaSource, browser color rendering or physical iPhone/PWA.
FFmpeg metadata is a QA oracle, not an available browser prerequisite. Product
adoption needs a browser-safe validated SPS/SAR signal and a bounded GOP/PES
window owner. Source local stat identity stayed stable, but current Drive
file/version/account identity and the full original hash were not revalidated.
No private source frame was displayed, original modified, Drive write made or
product deployment performed. No full-format support claim follows from this.

Sources inspected: [mux.js7.1.0](https://github.com/videojs/mux.js/releases/tag/v7.1.0),
[audio frame trimming](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/audio-frame-utils.js),
[timestamp handling](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/transmuxer.js),
[MP4 generator](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/mp4-generator.js).
