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
  payloads and FFmpeg-decoded buffers matched. **Correction after incremental
  review:** the arbitrary 4 MiB cut produces an error-level video decoder
  diagnostic for source and outputs despite exit 0. Equal concealed buffers do
  not prove quality preservation. The regenerated priority report correctly has
  `preserved:false` for all three modes. The synthetic positive has no diagnostic.
  Early/mid/late ordinal windows are not seek tests.
- Nine helper tests discriminate byte/metadata/timing changes, stale packaging,
  malformed input, unsafe chunk sizes, partial-write cleanup and CLI redaction.

The earlier decode-window draft used container-relative FFmpeg `-ss`, which
introduced different origin/rounding cuts despite identical packet timestamps.
It was replaced with one full bounded decode and ordinal windows; timing remains
an independent all-packet comparison. Do not use the superseded run reports as
evidence of pixel corruption.

## Incremental boundary discriminator

`node --test --test-concurrency=1 gop-boundaries.test.mjs preservation-probe.test.cjs`

`node incremental-probe.cjs`

The public synthetic clip is analyzed as one bounded input before output. This
is not a network-streaming/memory proof. `gop-boundaries.mjs` admits only one
stable H.264/AAC program, validated TS/PES framing, one AUD-delimited picture per
video PES, stable SPS/PPS, fixed DTS/presentation cadence, globally sample-count
anchored AAC timing, complete ADTS inside each PES and both tracks in every
flush interval. It cuts **before** the next verified IDR PES. Structural
eligibility does not prove a NAL payload is complete; strict decoding remains
an independent check. Unproven cases are rejected by this QA slice, not labeled
unplayable by the product.

`incremental-results.redacted.json` pins all producer identities and records nine
contrasting scenarios. EOF and six IDR-aligned fragments preserve all 360 VCL /
564 AAC payloads, timing, metadata and decoded buffers with no error diagnostic.
Arbitrary 349-packet flushes produce 640 VCL / 561 AAC; 30-video-PES cuts produce
540 VCL; cutting one TS packet into an IDR produces 365 VCL. They fail rather
than being called successful remuxing. The same source packetization with an
AAC frame split across PES passes EOF but fails incremental timing/PCM/diagnostic
checks. A VFR counterexample preserves coded payload but has a 20 ms overlapping
video sample duration, independently checked against the next DTS.

Seventeen helper tests include delayed audio causing duplicate init track IDs,
accumulating one-tick AAC drift and a truncated final picture that FFmpeg conceals
despite exit 0. Either source or output error-level diagnostics exclude success;
only sanitized diagnostic codes are saved. The 80-test parser/static/helper
integration passes. All generated media in each run is removed by exact path.

## Bounded incremental raw interval owner

`node --test --test-concurrency=1 psi-stream.test.mjs gop-stream.test.mjs`

After refreshing the nine-case report with the current producer:
`node stream-probe.mjs`

The dependency-free `gop-stream.mjs` incrementally retains raw TS bytes and
releases before-IDR intervals through a synchronous sink. `psi-stream.mjs` reuses
the existing CRC/section assembler; `elementary-stream.mjs` retains bounded
per-GOP presentation data and validates SPS syntax, stable parameters and global
audio sample cadence. No raw byte is rewritten and no whole-file prepass occurs
inside the owner. The next IDR PES must finish before the preceding GOP is emitted.

The 958,800-byte public fixture passes six input chunkings from1 to65,536 bytes.
First callback occurs with164,500–196,608 source bytes supplied; five intervals
arrive before EOF and the sixth at exact EOF. Retained raw byte peak is177,472;
the conservative accounted storage is387,328 encoded bytes including arena,
carry/counters, bounded PSI, PES/SPS scratch and transient output copy. This is
**not** a JS heap, complete mux/decoder/worker/MSE or product memory measurement.
The QA harness separately retains fixture and comparison outputs. Every emitted
interval concatenates to the exact input, and the persistent mux output is
byte-identical to the pinned strict-decoder positive result. The report binds
actual mux artifact, fixture, transitive producer and positive output hashes.

Eleven owner and ten PSI tests cover tiny/split headers, PSI repeats without
lifetime growth, malformed future input, limits, exact EOF, abort, generations,
reentrancy, unsupported async consumers, rejected Promises, redacted callback
errors and incomplete SPS. Independent review findings were reproduced and
fixed; parser/static/all-helper integration passes101/101. Early output followed
by later failure remains a failed stream, not whole-file validation. This unit is
still QA-only and does not change app.js, candidate assets or production.

## Browser-safe SPS aspect metadata

The shared bounded SPS reader now preserves missing VUI/missing aspect flag,
IDC0, defined ratios1–16, Extended SAR and reserved IDC as distinct evidence.
Zero Extended dimensions stay unspecified. Reserved values never qualify as
absent. Coded dimensions and color are unchanged; no aspect metadata is returned
until the entire SPS and trailing bits validate. Seven new tests cover every
defined ratio, 16-bit extremes, truncation and byte-input bounds.

Parser/Q1/static and upstream browser-adapter integration passes161/161.
The broader check caught a PSI alias-export incompatibility with the existing
browser bundler; an equivalent exported const fixes it and the actual generated
bundle execution test now passes. The nine-case incremental and six-chunk stream
reports were regenerated against the final producer. No remote diagnostic bundle
was replaced. Independent scoped SPS review passed51/51 with no material issue.

Reference implementations inspected: [FFmpeg VUI reader](https://ffmpeg.org/doxygen/8.1/h2645__vui_8c_source.html)
and [defined SAR table](https://ffmpeg.org/doxygen/8.1/h2645data_8c_source.html).
These support metadata interpretation, not browser rendering acceptance.

## Source-bound init adaptation

`node --test --test-concurrency=1 init-sar.test.mjs gop-stream.test.mjs`

`node init-binding-probe.mjs`

The first emitted interval now carries copied source SPS/PPS plus the validated
PSI video PID. Consumer mutation of those copies cannot alter the retained source
identity. `init-sar.mjs` is browser-safe and parses that SPS itself, binds exact
SPS/PPS and profile bytes in the pinned mux init, and checks unique track IDs,
sample counts, coded sizes, track/movie identity matrices and self-contained data
references. It rejects duplicate/misplaced/unsupported geometry boxes. Bounds:
2MiB init,128 parsed boxes,65535 bytes per parameter set.

Absent aspect/IDC0 removes only the introduced square `pasp` type (4 bytes become
`free`); exact explicit-square rational values are retained unchanged. Reserved,
zero Extended and non-square SAR fail closed pending display-geometry validation.
This is not a general MP4 validator or full audio/rotation/HDR acceptance. The
pinned mux writes SPS count byte0x01; the adapter recognizes it without silently
rewriting `avcC` reserved bits.

`init-binding-results.redacted.json` records two public complete clips at two
input chunk sizes each. One is the pinned square fixture, the other is generated
testsrc2/sine with `setsar=0` (generation recipe/tool versions/hashes recorded).
Raw mux output of the latter fails exactly SAR metadata preservation; source-bound
adaptation removes that mismatch. Coded video, SPS/PPS/SEI, AAC, all-packet timing,
full decoded pictures/PCM and zero error diagnostics pass. Both stream before EOF.
No FFprobe metadata participates in adapter decisions; native tools are independent
QA oracles. Temporary public media is deleted after each run. Nine adapter tests
and one source-copy test bring related integration to171/171; separate review of
the root wiring and driver found no material issue. Existing nine-contrast and
six-chunk reports were refreshed for changed producers.

## Explicit limits / next required unit

The priority4MiB sample is pushed in chunks but flushed only once at EOF and
does not pass strict decode. The synthetic interval experiment does not prove
uninterrupted product streaming,
bounded time-to-byte/keyframe seek, duration discovery,33-bit wrap/discontinuity,
native MSE/ManagedMediaSource, browser color rendering or physical iPhone/PWA.
FFmpeg metadata/strict decode are QA oracles, not available browser prerequisites.
Product adoption still needs worker
backpressure/lifecycle and mux GOP-cache memory ownership. VFR/sample-duration,
partial ADTS and other rejected combinations remain required support work, not
removed acceptance requirements. Next unit connects this source-bound incremental
output to a backpressured browser MSE path and proves a decoded frame before input
completion; worker ownership and indexed seek remain explicit requirements. Source local stat identity
stayed stable in the repeated read-only audit, but current Drive
file/version/account identity and the full original hash were not revalidated.
No private source frame was displayed, original modified, Drive write made or
product deployment performed. No full-format support claim follows from this.

Sources inspected: [mux.js7.1.0](https://github.com/videojs/mux.js/releases/tag/v7.1.0),
[audio frame trimming](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/audio-frame-utils.js),
[timestamp handling](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/transmuxer.js),
[MP4 generator](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/mp4-generator.js).
