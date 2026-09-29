# Q3 synthetic browser feasibility — 2026-09-30

Observed local feasibility only. The current actual corpus has no established
MPEG4 Part 2 requirement; this does not establish its absence. QA-FM-04, physical
devices and product Q3 admission/ownership remain open.

The isolated single-job FFmpeg/Emscripten build completed in 380.6 seconds.
Twenty-eight host snapshots show minimum available commit 1.504GiB and physical
memory 1.190GiB. The monitor did not terminate a process. The actual WASM memory
declaration is 32MiB initial/64MiB maximum; observed decoder heap is 32MiB.
These values do not bound the entire browser, encoder or compiler.

Installed isolated Chrome passed 3/3 cases. The exact synthetic source is MPEG4
Simple Profile 1 (`mp4v.20.1`); native playback reported media error4 and its
exact WebCodecs decoder configuration reported unsupported. Full 72-frame and
keyframe-aligned 24-frame outputs present and seek; cancellation after five
frames closes the worker and revokes owned URLs. The browser was closed.

The independent native oracle passed 2/2. Output is **lossy VP9**, 320×180/24fps,
8-bit I420, SAR1:1/DAR16:9 and BT709 limited. All-plane PSNR is 52.54/49.74dB;
minimum frame PSNR is 47.17/46.45dB. Maximum presentation-time difference is
0.333ms from the WebM 1ms timebase. No exact timestamp preservation, long-form
resource, VFR/HDR/rotation/audio/subtitle or physical-device claim is made.

The initial normal-output positional-write failure and earlier narrower oracle
result are retained. The QA consumer now assembles bounded positional writes,
preserving normal WebM finalization/indexing rather than forcing append-only
output. The source fixture is unchanged. Exact producers, input/output bytes,
build provenance and results are in `qa/q3-browser-execution/evidence-manifest.json`
and its README. The curated savepoint excludes the installed SDK, build tree and
duplicate source/static libraries; shared source recovery is documented there.

No app runtime, public allowlist, candidate deployment or production was changed
by this feasibility unit. Existing rc.14, production v1.21.0 and automation PAUSED
remain. The proof supports further bounded development only after genuine
unsupported video evidence and product ownership/admission design are available.
