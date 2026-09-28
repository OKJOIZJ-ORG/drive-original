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
`free`); exact explicit positive rational values are retained unchanged, including non-square SAR. Reserved and zero Extended SAR still fail closed. Raster dimensions bind separately to the source SPS and pinned mux layout; `pasp` must equal the exact declared ratio, and dimensions are never scaled again. The2026-09-29 actual diagnostic found Extended2600:2601 at360x640; generated native preservation checks retain SAR/DAR, coded payloads, decoded pixels/PCM and clocks. Actual candidate replay is recorded separately.
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

## Isolated Chrome incremental MSE discriminator

`node mse-browser-probe.cjs`

This local-only allowlisted server and fresh Chrome context serve only public
generated media and required modules. The server sends206,800 of958,800 bytes
and holds the remaining response until an explicit QA release. The incremental
owner/source-bound init reaches a real `requestVideoFrameCallback` with360x640
dimensions while the tail remains held and sourceComplete=false. The EOF-only
control emits no fragment/frame while held, then decodes only after full input.
After release the incremental trial appends all six fragments and progresses
media time. This is actual desktop Chrome153.0.8010.54, not iPhone/Drive/app evidence.

The main-thread discriminator admits one188-byte parser feed at a time and
awaits a successful SourceBuffer `update` plus `updateend` before more input.
`updateend` alone is not success because errors/abort also terminate there.
Invalid init and an injected play rejection terminate and clean up. A separate
tail-held cancellation aborts the fetch/parser. Independent review reproduced
retained mux GOPs after dispose (which only clears listeners); reset-before-dispose,
dropping references, reader-lock release, SourceBuffer removal and a shared cleanup
promise fix it. Every trial verifies a populated mux GOP cache becomes empty,
references are released, video src is cleared and its object URL revoked.

Five browser trials pass, with a19-test static regression check and syntax checks.
Producer-pinned evidence: `mse-results.redacted.json`. Input chunk/backpressure
observations are harness-level only: the network/browser may buffer beyond the
single JS read, and mux/internal MSE/decoder allocations are not a total memory
guarantee. There is no worker, sustained-window eviction, indexed seek, full-format,
actual browser pixel/audio comparison or deployed product integration yet.

API references inspected: [MSE append/event algorithms](https://www.w3.org/TR/media-source-2/)
(current working draft, not universal support) and [ISO BMFF MSE byte stream](https://www.w3.org/TR/mse-byte-stream-format-isobmff/).

## Dedicated-worker input/output ownership

`node --test --test-concurrency=1 transmux-session.test.mjs worker-client.test.mjs`

`node mse-browser-probe.cjs --worker`

The pure synchronous session is hosted in a real module Worker. The main thread
transfers at most64KiB per input and has one input credit. One output fragment
(at most2MiB) may be outstanding; a matching generation/sequence ACK after the
consumer resolves is required before parsing resumes, including within the
current input. Exact-size EOF also waits for its final fragment ACK. The worker
protocol accepts no URL, credentials or network request. Original-byte source
identity and authenticated reading remain parent responsibilities, not implemented
by this QA module. Public synthetic output at two chunkings is byte-identical to
the previously pinned strict-preservation positive, including all six fragments.

`worker-results.redacted.json` records six real Chrome trials: incremental,
tail cancel, invalid init, play rejection, held ACK then release, and held ACK
then cancellation. A real360x640 frame precedes source completion. A read-only
worker inspection compares the actual session's full counters before/after tail
release while ACK is held:164,536 bytes consumed, one output outstanding and
one retained64KiB input do not change. The main's last-reported consumption alone
is not used as proof. Releasing ACK completes six fragments; cancelling does not.

Terminal reset/dispose releases the parser, input/output/config/init and actual
pinned mux GOP backing buffers. Browser completion observed a1,384,052-byte peak
for GOP-cache backing allocations (six cached GOPs), versus695,423 NAL view bytes;
these are deliberately different measurements. The worker's encoded owner peak
is849,424 bytes with its default arena. None of these counts covers total JS heap,
transient mux scratch, transport, MSE or decoder allocations. The cache guard is
8MiB; input/output limits and cleanup-to-zero are checked in every browser trial.

Nineteen new protocol/bridge tests cover transfer detachment, stale generations,
credit/order violations, reentrant ACK/abort, rejected send/consumer and terminal
cleanup failures. Independent review closed an unhandled ACK-post rejection and
an in-transit finished/error response lost during abort. Cancelled EOF remains
cancelled even when a finished response supplies valid cleanup evidence. Related
parser/Q1/static/browser-adapter integration passes190/190. The main-thread five
trial baseline was refreshed; both reports pin current producer hashes.

This is a QA-only worker/MSE slice, not a shipped product media engine. Sustained
buffer-window eviction, time/indexed seeking, duration and all device/format gates
remain. No candidate or production asset was changed.

## Sustained window and sequential range admission

`node --test --test-concurrency=1 buffer-window.test.mjs worker-client.test.mjs`

`node mse-window-probe.cjs`

The browser harness now optionally admits exact sequential64KiB Range responses
with a fixed strong ETag/If-Match, exact206/Content-Range/length, streamed body
overflow/short checks and a single read/request owner. This is a local public
fixture protocol, not a claim of authenticated Drive identity handling or a
production-optimal request size. ACK-held buffering prevents the next range
request, rather than relying on browser backpressure for a full-body fetch.

The six-second forward high-water/four-second resume window serializes append
and backward removal, targeting six seconds behind at admission with a one-second
removal step. The actual MSE update event and remaining current playback range
are checked after removal. Pause waits have no codec deadline; worker processing
watchdogs stop while the consumer owns backpressure and resume after ACK.
Cancellation, media error and sourceclose wake/terminate waiters. A normal pause
that interrupts a pending play Promise is distinguished from play rejection.

Two local failures were reproduced before fixes: a normal pre-frame pause was
reported as QA_PLAY_REJECTED, then a16.1-second pause hit the old15-second worker
request watchdog. Independent review additionally closed lost originating removal
error codes and an error event leaving a paused window stuck indefinitely. The
driver also caught its playback-rate setup being reset by media load; it now
sets defaultPlaybackRate and asserts the actual rate is4, rather than inferring it.

`window-results.redacted.json` records a generated72-second/8,795,392-byte public
clip (36 GOP fragments). The same pure worker session preserves all coded content,
metadata and normalized timing; all2,160 native decoded video frames and full PCM
match with zero error-level diagnostics. This is a native QA oracle, not Chrome
pixel/audio equality. The browser completes at4x and reaches ended with progressing
real frames. Window peak is7.852 seconds ahead and14.080 seconds overall with29
explicit removals, compared with72.021 seconds retained by the no-window control.
The target behind window is enforced on admission, not a claim of exact six-second
retention after EOF; total exposed span remains bounded in the observed clip.

During the16.1-second pause, actual worker session counters and server request/byte
counts stay unchanged. Resume completes all135 bounded ranges. Other trials cover
window cancellation, injected remove failure, response identity drift and injected
media-error event routing while paused. The last is not a naturally occurring codec
failure reproduction. All six trials clean SourceBuffer/reader/object URL/worker
and retained encoded/cache owners. Three policy tests plus one watchdog regression
and related scoped tests pass42/42; both older browser suites pass5/5 and6/6 with
refreshed producer hashes. No original or deployed asset was touched. Only generated
public source/remux media under the run directory was removed after the test.

This is72-second synthetic desktop evidence, not tens-of-minutes real-time/device
stability, arbitrary large-GOP/VFR safety, GPU/decoder/total heap accounting or
efficient indexed seek. Removal may extend to a later random-access point under
the [MSE removal algorithm](https://www.w3.org/TR/media-source-2/#sourcebuffer-coded-frame-removal);
the tested two-second-GOP configuration and verified current range are explicit.

## Bounded raw timestamp windows

`ts-window.mjs` extracts only complete PES/NAL/ADTS anchors from an arbitrary
packet-aligned window, ignoring leading continuations and withholding incomplete
tails unless the caller supplies exact EOF. Input is capped at1MiB, selected
PES assembly at64KiB per track, and output at4096 records. Source offsets use
safe arithmetic beyond4GiB; timestamps remain raw33-bit90kHz values, not inferred
epochs. Parameter sets are copies. Discontinuity and transport/continuity errors
fail closed. This is a deliberately bounded syntax candidate, not decoder proof.

`node qa/v2-07b-ts-q1/ts-window-probe.mjs` independently compares FFprobe's
packet positions, timestamps, keyframe flags and AAC frame counts for five
public full/head/interior/tail/virtual-large-offset windows. All five pass;
the full control has360 video frames/six IDRs/564 AAC frames.14 scanner tests
and related boundary/static integration pass41/41. Producer-pinned evidence:
`ts-window-results.redacted.json`. No full-file index, exact global duration,
clock continuity, efficient seek or actual Drive/device claim follows. Next
is bounded time-to-byte bracketing and a locally verified decode-start interval.

## Sparse target / RAP candidates

`ts-seek.mjs` uses the existing identity/generation/deadline-fenced exact reader
for bounded head/tail/interpolation windows and at most1MiB local expansion.
It binds observed PSI/parameters/clock cadence, retains the common AAC/video
origin and exposes sampled-candidate duration with globalContinuityVerified=false.
The target has actual packet anchors on both sides, never an invented EOF frame.
Audio-only lead, final-frame span without a later anchor, VFR/wrap/long-GOP cases
remain unfinished support; a discovered RAP is not a directly playable TS slice.

`node qa/v2-07b-ts-q1/ts-seek-probe.mjs` generates180s public media and compares
real loopback Range results with an independent FFprobe whole-source oracle.
10/50/90% each match the RAP and one-frame packet bracket with3 requests and
1,572,432/21,992,052 bytes (7.15%). Nine cases include pre/post identity drift,
generation cancellation, abort, malformed206 and request exhaustion. Terminal
cases assert exact no-extra-read counts.12 helper tests plus related integration
pass82/82. Evidence: `ts-seek-results.redacted.json`. Generated media is cleaned;
the native oracle's whole-source buffers are outside bounded probe accounting.
No decoder, actual browser target frame, private/Drive/device or product success
is claimed. Next: source-bound local decode-start and presented-frame seek proof.

## Actual target-frame seek (one bounded interval)

`seek-input.mjs` independently binds the source PSI, RAP, parameter sets and
local packet bracket, then repacketizes one complete GOP and complete AAC PES
with at least two frames of preroll except at true source beginning. Original
PES headers, timestamps and compressed payloads are copied byte-for-byte; only
TS packetization/counters/adaptation (including PCR) change. Output is capped
at aligned1MiB. Missing audio coverage/partial input/extra tracks fail closed.

`node qa/v2-07b-ts-q1/seek-playback-probe.cjs` tests180s public input against
the full-source native oracle and actual isolated Chrome153. Three native
10/50/90% intervals preserve coded/timing/metadata and all60 decoded video
frames per interval. Expected PCM length is exact; source PCM matches after
one AAC decoder-warmup frame, before the actual target. Five browser cases
show real target rVFC at18.021333/90.121333/162.221333 seconds, within one frame
of18.025467/90.127333/162.229200 targets, with exact native source PTS mapping.
Each reads1,637,856/21,992,052 original bytes and appends one worker fragment.
Replacing a held old seek gives zero old appends; postflight drift appends
nothing. Cleanup removes the SourceBuffer, revokes the URL and terminates the
worker with encoded owners empty.10 helper tests and related112/112 pass.

Evidence: `seek-playback-results.redacted.json`. Native whole-source buffers
are outside bounded browser accounting; browser is muted and color rendering
is not compared. This is one short GOP after each seek, not continuous post-seek
playback, a product path, actual Drive/priority/iPhone or all-format acceptance.
Next: bounded raw-source bootstrap so the existing stream owner can continue
from the chosen RAP through EOF, followed by product vertical-slice integration.

## Continuous post-seek source suffix (2026-09-27)

`seek-bootstrap.mjs` seeds validated original PAT/PMT, consumes each original
suffix packet once, nulls only pre-start selected media/partial initial PSI,
and validates raw counters before output normalization. Admitted PES/payload/
PCR/timestamps stay intact. Original offsets differ from prefixed virtual size.
64KiB pushes/188-byte carry, copied PES bindings and terminal fences have13 tests.
Observed bootstrap-owned peak13,245–14,309 bytes is not total pipeline memory.

`node qa/v2-07b-ts-q1/seek-playback-probe.cjs --continuous` passes three native
72s suffixes and nine actual Chrome153 cases.10/50/90% target rVFC times are
7.221333/36.121333/65.021333, then ended at4x with33/19/4 fragments. Before the
first frame,262,144/524,288/262,144 suffix bytes are read, in addition to sparse
probe reads. Forward buffer<7.73s/span<13.94s, evictions26/13/0. Paused real
worker/server freeze, old-read replacement, identity drift and media-error
precedence pass. EOF pause11.1s resumes without the former10s timeout.

Native proof now checks absolute output PTS/DTS, source video frames, original
AAC suffix hashes/counts and all PCM against independently extracted original
ADTS decoded from the same fresh start. No tolerance was added. Uninterrupted
source PCM at10% is **not equal**:16 int16 values differ by1 in selected frame8;
same-start native PCM is exact. The report retains this counterevidence.
Stateful AAC noise synthesis is plausible ([FFmpeg n8.1 source](https://raw.githubusercontent.com/FFmpeg/FFmpeg/n8.1/libavcodec/aac/aacdec_proc_template.c)),
not a proven cause. Reset and uninterrupted decoder histories are distinct.

Evidence: `continuous-seek-results.redacted.json`; original180s native3/browser5
baseline refreshed in `seek-playback-results.redacted.json`; tests128/128 pass.
This is local generated QA, not product/Drive/priority/iPhone/all-format success.
Browser audibility/color and total memory remain open. Next: product vertical
slice, not additional all-format platform prerequisites.

## Explicit limits / next required unit

The priority4MiB sample is pushed in chunks but flushed only once at EOF and
does not pass strict decode. The synthetic interval experiment does not prove
uninterrupted product streaming,
bounded time-to-byte/keyframe seek, duration discovery,33-bit wrap/discontinuity,
native MSE/ManagedMediaSource, browser color rendering or physical iPhone/PWA.
FFmpeg metadata/strict decode are QA oracles, not available browser prerequisites.
Product adoption still needs app/Drive source-owner integration and complete
pipeline memory evidence. VFR/sample-duration,
partial ADTS and other rejected combinations remain required support work, not
removed acceptance requirements. The local MSE first-frame unit is now observed;
the worker input/output ACK owner and72-second window now have local public-fixture
evidence. Indexed/continuous seek has the local proof above, not Drive/device
acceptance. Source local stat identity
stayed stable in the repeated read-only audit, but current Drive
file/version/account identity and the full original hash were not revalidated.
No private source frame was displayed, original modified, Drive write made or
product deployment performed. No full-format support claim follows from this.

Sources inspected: [mux.js7.1.0](https://github.com/videojs/mux.js/releases/tag/v7.1.0),
[audio frame trimming](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/audio-frame-utils.js),
[timestamp handling](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/transmuxer.js),
[MP4 generator](https://github.com/videojs/mux.js/blob/v7.1.0/lib/mp4/mp4-generator.js).
