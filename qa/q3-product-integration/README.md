# Q3 local product integration qualification

Observed local synthetic product runtime only. No account/provider/Android input,
candidate publication, production switch or QA-FM-04 actual-file completion.
Frozen `qa/q3-browser-execution` sources and artifacts remain unchanged.

`node qa/q3-product-integration/browser-audit.cjs` uses the immutable original
320×180/24fps/3s MPEG4 fixture; `--640` uses `synthetic-640.mp4`, generated with:

```text
ffmpeg -hide_banner -loglevel error -f lavfi -i testsrc2=size=640x360:rate=30:duration=3 -vf setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv -c:v mpeg4 -q:v 2 -bf 0 -g 30 -pix_fmt yuv420p -movflags +faststart -y synthetic-640.mp4
```

The driver requires ≥1GiB physical and ≥2GiB commit headroom, serves only fixture
files and allowlisted media assets on loopback, opens one disposable Chrome
headless profile, uses finite per-case/browser deadlines, and closes its browser
and server. Chrome DevTools MCP was inspected first and returned the existing
MCP-owned profile lock; no existing profile/process was changed.

For each source, actual native source presentation rejects with error4, exact
WebCodecs input capability is false, then the product worker produces bounded
fragmented VP9 MP4. The product general-player presents original dimensions,
starts at the requested2.2s keyframe window, reseeks to1.5s, and closes owned
workers/sources/URLs. Cancellation at the first acknowledged output chunk also
settles. Each profile passes4/4 in `browser-320-results.json` and
`browser-640-results.json`. These are product worker/player checks; the full app
Q3-choice route and actual Drive/device acceptance remain separate.

`node qa/q3-product-integration/oracle.cjs` independently decodes original and
product output with installed native FFmpeg. Both complete outputs preserve
frame counts, original dimensions, cadence, BT709 limited8-bit I420 and source
presentation clocks at FFprobe's6-decimal precision. All-plane PSNR is
52.54/53.03dB; minimum frame PSNR47.17/48.01dB. Synthetic38/33dB thresholds are
not perceptual equivalence, all-resolution quality or long-form certification.
FFprobe omits square SAR for this VP9 MP4. Independent sample-entry/tkhd geometry
checks confirm square effective pixels and16:9 display; Mediabunny's preferred
source intentionally omits `pasp` when its pixel ratio is1:1.

`browser-first-errno-failure.json` retains the first failure: JS assumed a host
EAGAIN value. The product bridge now compares FFmpeg's actual `AVERROR(EAGAIN)`.
`oracle-first-sar-unknown.json` retains the earlier incomplete SAR comparison;
the output was unchanged by adding independent geometry inspection.

Source distribution is owned by `licenses/video-q3-source-NOTICE.md` and its
manifest/archive. `source-results.json` records23 material checks, all3 shared
official archives, actual32/64MiB WASM bounds, and exact WASM/glue equality from
the extracted portable relink recipe under the already-installed same toolchain.
Compiler executables/cache and full generated verification trees are excluded
from the curated evidence. Reconstruct/extract the published source package to
recreate that verification tree; `verify-relink.sh` is the local toolchain binding.

Product admission limits: one MPEG4 Simple Profile1 video track, explicit SDR
BT709 limited color, progressive8-bit I420, square SAR/no rotation, even original
dimensions ≤4160 per axis and ≤1920×1080 pixels, CFR≤60fps, ≤65536 samples,
≤4MiB moov and ≤1MiB picture packets. B frames, audio/subtitles/extra tracks,
HDR, VFR, clipped/nonidentity edits/reordering and unknown metadata combinations remain explicit
limits. Inputs are never downscaled or hydrated into a whole-file WASM buffer.
The output encoder/MSE must accept its exact VP9 configuration; larger target
bitrates query Level5.1 instead of exceeding Level4.1's30Mbps limit. Configuration
support alone does not qualify those larger profiles. Runtime heap bounds do
not bound the whole browser, native encoder, GPU or host memory.

Movie, track and optional identity edit durations must share one duration field.
Exact rational clocks are compared using BigInt. Nonexact endpoints may only be
floor/ceil quantization strictly below one movie tick, with a movie tick no longer
than one source picture; coarser clocks require exact identity. Original media
timestamps remain authoritative. `timing-tests-results.json` records the23 new
tests after the review fix, including the coarse3s→2s counterexample, fine
rounding, conflicting headers and large uint32 clock products. Three new timing
regressions reproduced missing rejection before the fix. Earlier browser and
native oracle evidence is reused for its unchanged exact3s inputs/outputs.

Focused checks are `tests/video-q3.test.mjs`, `tests/video-q3-app.test.js`, and the
existing general/audio source/routing tests. They cover source limits, >4GiB
sparse metadata traversal, non-B packet mapping, real WASM metadata/end drain,
exact capability/cancellation, explicit lossy labels and retirement barriers.
Actual-file necessity, full app choice/identity transitions, long-form sustained
resources/quality/seek/EOF and PC+Android physical-device qualification remain
the next owning acceptance work.

Root's single full product run found two stale test expectations: source archive
count8→9 and SW shell count41→47. `shell-tests-results.json` records the related
86/86 shell/SW checks after deriving full lists from source manifests and the
authoritative shell. Explicit assertions retain all6 Q3 runtime assets and
public Q3 source tgz/manifest/NOTICE exclusion from cache/refresh. Private full
logs remain outside the curated distribution; no full-suite repeat or product
mutation was needed for this test-only fix.
