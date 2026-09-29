# Q3 browser execution feasibility

Status: synthetic browser feasibility verified, not a product runtime. No application, worker allowlist, public distribution, account, Drive original, or production change is made here.

## Observed preflight

`probe.cjs` opened installed Chrome 153.0.8010.54 in a fresh Playwright headless profile and closed it. `capabilities.json` records unsupported `mp4v.20.9` WebCodecs decoding/encoding and empty native `canPlayType`. AVC, VP8, VP9, and AV1 encode/decode configurations were accepted. Configuration support is not media execution proof. Chrome DevTools MCP was attempted first but its owned profile was locked; no existing browser or personal profile was stopped.

Curated corpus evidence does not establish an MPEG4 Part 2 requirement. This synthetic prototype cannot close the corpus or all-format acceptance gates, and auth/network/container/Q0/Q1/Q2 failures are not Q3 evidence.

## Prepared execution

1. `node qa/q3-browser-execution/launch-build.cjs`: isolated copy of the pinned FFmpeg source, the already-local Emscripten toolchain and cache, one compiler job. Requests the LGPL MPEG4 decoder; actual configure also enables its H263 decoder dependency. No FFmpeg CLI, filesystem, network, server, whole-file wasm input, external codec library, GPL, or nonfree code is enabled in the browser module.
2. `node qa/q3-browser-execution/fixtures.cjs`: generate a 3-second 320x180 24fps MPEG4 Part 2 SDR BT709 video. Native FFmpeg/ffprobe produce synthetic data and packet evidence only.
3. `node qa/q3-browser-execution/browser-audit.cjs`: native unsupported media error plus bounded per-packet software decoding in a dedicated browser worker, native VP9 encoding, WebM mux, actual native output presentation and seeks, then cancellation and worker cleanup.
4. `node qa/q3-browser-execution/oracle.cjs`: independent native decoding of original/output, all-plane I420 PSNR, per-frame minimum, dimensions, color metadata, and frame counts. Native FFmpeg is solely the oracle.
5. `node qa/q3-browser-execution/hash-evidence.cjs`: pin producers, inputs, outputs, decoder source/config/library artifacts, and shared muxer.

The intended codec memory is initially 32 MiB and maximum 64 MiB, one packet at a time, one VideoFrame followed by encoder flush, and an 8 MiB finite output cap. The prototype rejects all inputs outside its explicit synthetic profile; it never resizes an admitted input. This is qualification scope, not a universal 180p/720p/1080p policy. Matching bitrates are not treated as matching quality. Real-time factors from a tiny synthetic sample cannot establish sustained CPU/GPU/thermal behavior, large-resolution feasibility, battery cost, device stability, or long-form stream acceptance.

## Source and distribution

The source archive is the existing official FFmpeg commit `140fd653aed8cad774f991ba083e2d01e86420c7`, and the toolchain source is the existing Emscripten commit `09f52557f0d48b65b8c724853ed8f4e8bf80e669`. Q3 builds into this folder, avoiding mutation of Q2's configured tree. `bridge.c` is new MIT code; FFmpeg retains its upstream LGPL terms. This experiment does not make an LGPL/MPL compliance or codec patent clearance claim. Distribution requires corresponding FFmpeg and toolchain sources, notices, exact build scripts/configuration, the bridge and relink materials, plus the existing muxer's license, to be preserved and made available under their actual terms. No public allowlist entry is authorized by this proof alone.

Primary sources checked: [W3C WebCodecs](https://www.w3.org/TR/webcodecs/), [Chrome WebCodecs guidance](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs), [FFmpeg legal guidance](https://ffmpeg.org/legal.html).

## Retained barriers

Initial build invocation failed before compilation because the command shell escaped the quoted Bash executable; `launch-build.cjs` avoids shell interpolation. Host committed-memory pressure subsequently required serialization with Q2; no successful build or pipeline execution is claimed until the result artifacts exist and pass.

## 2026-09-30 inspection and tool preflight

`node qa/q3-browser-execution/launch-build.cjs --preflight` now resolves the
already-installed SDK's `llvm-nm.exe` explicitly and checks nm, Emscripten and
Make without configure, compilation or linking. It passed with LLVM22,
Emscripten4.0.15 (the pinned source revision above) and Make4.4.1. The earlier
configure log reported `nm: command not found`; that diagnostic is retained in
`build-configure-interrupted.log`. This tool correction does not prove the
configure or decoder build will complete. A signalled/null build exit now fails
instead of being counted as exit0. Preflight writes `build-preflight.log`, leaving
the prior `build.log` intact.

Observed host snapshot at 2026-09-29T19:31:26Z: physical available1.776GiB,
commit available0.770GiB. No remaining bash/make/clang/wasm-ld build process was
observed. The build was not started under this pressure. User processes, browser
profiles, pagefile and volume settings were not changed. There is no measured
Q3 build peak or trustworthy build-memory prediction; the runtime's configured
32/64MiB WASM heap does not bound compiler, Chrome, JavaScript or encoder memory.

The actual rc.10 bounded corpus record has36 selected objects,15 complete TS
structures signalling H264/AAC,6 ISO-BMFF prefixes and other container signatures.
It does not extract every object's video codec. The separate actual large-ISO
sparse record identifies AVC/AAC; the declared MKV/AVI samples were TS and later
played through original Q1. None of these observations establishes a MPEG4
Part2 requirement or excludes unsupported video codecs in unprobed objects.
The69-row count in the checkpoint is the specification acceptance-ID count,
not a corpus-file count. `QA-FM-04` still requires an actual approved browser
path for a genuinely unsupported video codec, so this synthetic prototype is
useful as feasibility evidence without being real-corpus acceptance.

Before treating any future output as qualified, preserve and compare resolution,
frame count and timestamps/cadence, SAR/DAR, rotation, pixel format/bit depth,
color primaries/transfer/matrix/range and HDR side data. Keep source audio,
subtitles and track identities outside this video-only fixture's claims. This
prototype intentionally changes the video codec from MPEG4 Part2 to lossy VP9;
PSNR thresholds qualify only this synthetic SDR picture. Native decoded samples
are an independent oracle, not the browser runtime. Neither matching bitrate nor
the existing dimensional/color assertions alone proves original quality,
VFR/HDR/rotation/audio preservation or physical-device support. No compiled WASM,
browser-results, output WebM or oracle-results existed at this inspection.

## 2026-09-30 completed synthetic execution

The single-job build completed configure/compile/link with exit0 from
2026-09-29T19:44:33Z to19:50:53Z. `build-resource-results.json` retains28 host
samples: minimum physical available1.190GiB, minimum commit available1.504GiB;
no process termination was required. The monitor tracks only its launched tree
with PID and creation identity. The decoder is614111bytes/SHA256
`83ee07e7ca450271c5c380c8d76ff42473d2ac4cfb5b3916bf5b2b5c02a7740b`.
`inspect-codec.cjs` validates the actual binary's32MiB initial/64MiB maximum
memory declaration; observed browser decoder heap remained32MiB.

Chrome DevTools MCP was attempted first again and reported its owned profile
lock. The existing Playwright driver used a fresh isolated Chrome profile and
awaited `browser.close()`; it did not stop or read an existing personal browser.
Native source presentation failed with media error4. The fixed source is MPEG4
Simple Profile with extradata profile-level byte1, so final qualification probes
exact `mp4v.20.1` and requires decoder support=false, rather than treating the
earlier `.9` preflight as this fixture's codec configuration.

The first run is preserved in `browser-first-positional-failure.json`. Its two
normal cases failed because normal WebM performs header/index backpatch writes,
while the initial consumer required append-only positions. Finalization/seek
needs those fields. The repaired QA writer preserves positions with an8MiB
extent cap and16MiB total-write cap; the finite consumer applies writes in order.
No append-only mode, resolution reduction or changed input was used to avoid the
failure. See [Mediabunny's WebM output options](https://mediabunny.dev/guide/output-formats#webm).

Final `browser-results.json`:3/3. Full72frame/3second output presents and seeks to
0.4/1.5/2.5s. The2.2s request starts decoding at the retained2.0s keyframe,
preserves24frames through the original end and seeks to2.4s. Cancellation at
frame5 reports `Q3_CANCELLED`, closed decoder/worker and zero worker count.
Successful output object URLs are revoked. Peak encoder queue is1.
Observed tiny-fixture processing rates are5.99x/5.56x; these are not sustained
real-file, high-resolution, mobile, battery or thermal qualifications.

Final independent native oracle:2/2. MPEG4 Part2 becomes **lossy VP9**. All-plane
PSNR is52.54/49.74dB, minimum single-frame PSNR47.17/46.45dB, against this fixture's
38/33dB thresholds. Both outputs retain320x180,24fps,72/24frames,8-bit I420,
SAR1:1/DAR16:9 and BT709 limited color. Every decoded presentation timestamp is
aligned to its source frame with maximum0.333ms error from WebM's1ms timebase;
timestamps are not byte-exact. The fixture has no rotation/HDR side data, audio
or subtitles; those features remain unqualified. The first narrower passing
oracle is preserved in `oracle-first-quality-pass.json`. Exact final producers,
inputs, outputs and build provenance are owned by `evidence-manifest.json`.

Real-corpus Q3 necessity, product admission/ownership/UI integration, sustained
resource costs, other profiles and physical devices remain open. This is local
synthetic browser execution plus a separate native oracle, not a distributed
runtime, actual Drive replay or device acceptance.

## Curated savepoint and reconstruction limits

The savepoint keeps the exact executed QA producers, synthetic fixture/output,
WASM, configuration, failed and successful records, shared muxer, and read-only
host snapshot helper. The installed SDK/cache, build tree, temporary files and
duplicate static libraries/source archives are excluded. This is not a new
cross-host reproduction claim.

The three shared source archives remain available inside the seven-part
`licenses/audio-source-v1` package: reconstruct and extract that package using
its notice and manifest, then recover its `archives/` entries to the original
`qa/q2-audio-compatibility/build-investigation/sources/` paths if replaying the
local build/historical verifier. The omitted Q3 static libraries are
generated by the isolated Q3 build. They are bound by the evidence manifest but
must be rebuilt before the complete offline verifier can run on a fresh clone.
The build also requires the compatible Emscripten installation described above;
it never installs or replaces that toolchain automatically. The committed
browser and oracle drivers can reuse the retained WASM without rebuilding it.
