# Q2 general Worker integration — local preparation

Observed on isolated native Chrome 153.0.8010.54. No app routing, service worker,
public file list, account, volume, Git or deployment changes were made by this unit.

## API and contract

`streamGeneralQ2` in `media/audio-general-pipeline.mjs` accepts the same source,
generation, cancellation, targetTime, limits, onWindow and onChunk contract as
`streamGeneralQ1`. `media/audio-general-worker.mjs` uses the existing
`startGeneralWorker` protocol. Inject this Worker through `workerFactory` in
`createGeneralPlayer`; one owning Worker is created and terminated per seek/job.
The source, timeline parser, AVC parameter guard, transport owner and MSE player
are reused. `general-admission.mjs` adds only optional `audioCodecs`; omitted options
remain strict AAC (`mp4a`). Q2 explicitly admits `ac-3` and `ec-3`.

The actual Worker runs `observeAudioCompatibility` before allocating the decoder.
On this target native AC3/EAC3 decode is unsupported, native Opus stereo 48 kHz
320 kb/s encode and Opus/MP4 MSE are supported. Missing support fails closed.
The window carries original `sourcePacketOrigin`, `videoStartTimestamp`,
`sourceEndTimestamp`, policy, final AVC config and actual native-output Opus config.
It includes explicit `Q2 / lossy-transformed / bitPerfectAudio:false` status.
The initial ftyp bytes are retained up to 64 KiB until native Opus output supplies
its configuration. No chunk is exposed before its window. Each chunk retains
batchSize/batchEnd and is ACKed after native SourceBuffer updateend.

Q2 keeps `windowOrigin:0`: original source PTS/DTS and real negative audio preroll
are retained. The immutable decoder window identifies generation and source clock.
Audio is decoded one packet at a time with the source-built bridge; no custom
serializer or independent source reader is involved in this pipeline. Native Opus
is the only encoder. PCM continuity is checked on the exact 48 kHz grid before
core encoding, preventing implicit gap-padding, resampling or downmix.

The existing general-player currently omits Q2 status from its events and masks
AUDIO_* error codes. Root owns those integration changes and must expose the lossy
route clearly before application activation. This unit does not change that file.

## Bounds and supported profile

Qualified: unfragmented MP4 AVC with unchanged parameter sets, no reordered video,
explicit color, AC3/EAC3 stereo 48 kHz; square and 4:3 sample aspect ratios verified.
B-frames, unspecified color, audio discontinuities, 5.1, other rates/codecs,
fragmented input, TS Q2, unsupported edit policies and explicit end trimming fail
closed. The existing strict allocation-driving index limit (65,536 samples/track),
4 MiB metadata/retained-mux limit, 2 MiB coded-video packet limit and source budgets
remain; this is not universal long-container support.

WASM has a source-built 32 MiB initial / 64 MiB hard engine maximum. The decoder
accepts one <=64 KiB packet, <=4,096 PCM frames / <=32 KiB PCM, one native context.
Native core encoding queues at most four inputs before dequeue backpressure;
fragment retention is guarded by the shared muxer. Output batches <=8 MiB,
transfer chunks <=256 KiB, one unacknowledged transfer. The prefix <=64 KiB is
concurrent ownership, not lifetime output. WASM heap is separate from JS, MSE,
GPU and total browser memory. No lifetime packet/output/PCM cap was added.
Cancellation closes output/encoder and native context, drains the source and
consumer through the existing owner, then terminates the enclosing Worker.

## Verification

- `node --test tests/audio-compat-general.mjs tests/audio-compat-lifecycle.mjs tests/general-q1.test.mjs`: 26/26. Four new admission/failure cases; prior Q1 strict-default and backend lifecycle cases also pass.
- `node qa/q2-general-product-integration/native.cjs`: 13/13, no page errors.
  Actual AC3/EAC3/SAR MSE generation, existing general-player source-clock seeks
  at start/middle/near-end with presented native video frames; 100-second output;
  B-frame/5.1 rejection; corrupted first EAC3 packet fails with zero append and
  native opened=closed=1; cancellation during second append stops at two appends,
  suppresses stale ACK, drains updateend/source and terminates; changed identity
  on seek fails closed and aborts both source lifetimes.
- `python qa/q2-general-product-integration/oracle.py ac3` (also `eac3`, `sar`):
  each 8/8. All 144 coded AVC packet hashes, config, geometry, SAR/color fields,
  decoded pixel hashes and original PTS/DTS/duration match exactly. Both channels
  retain 48 kHz, full 288,000-frame source presentation window, residual lag 0;
  full-window SNR AC3 45.044/43.036 dB, EAC3 45.139/43.121 dB. Audio is lossy.
  Opus reports start -0.005333 s / coded duration 6.04 s; comparison
  removes 256 frames of real source preroll using presentation timestamps and
  declares the original source presentation window. Native endOfStream can extend the element duration to codec tail padding; root must retain the declared source end for strict end-of-playback behavior.
- 100-second native run: 12,263,139 output bytes, 38,400,000 cumulative PCM bytes,
  3,125 decoded audio packets, 32 MiB measured WASM, zero live contexts at close.
  Peak mux bytes 164,143 / 83 samples; source cache <=256 KiB, one pending ACK.
  This discriminates removal of the previous 8 MiB lifetime caps.

FFmpeg is used only for independently generated synthetic fixtures and offline
oracle comparison. QA captures synthetic output into a bounded local Blob for
saving; no application source or pipeline buffers a whole file. Test server binds
loopback and closes, isolated browser closes. The shared/private Chrome profile
was not operated; fallback follows the previously confirmed MCP profile lock.

## Evidence history and legal/source binding

`attempt-final-config.log` retains the initial early-ftyp configuration failure;
`attempt-origin-shift` retains the 5.334 ms video / 256-sample audio shift failure.
Both are rejected attempts. The current outputs, native-results and oracles are
separate. `prepare*.py`, `fix*.py`, `debug.py`, `extend-native.py`, `add-bframe.py`
and `final-guards.py` are historical implementation scaffolds: DO NOT replay them
over the final files. Use the final drivers instead.

The accepted 75-entry AC3, 128-entry EAC3 and 24-entry backend proof manifests are
preserved unchanged; `historical-integrity.json` verifies their exact bindings.
The decoder WASM remains SHA256
`48f85a683a94f6b35a21ce33c12a99312ac64e450eca4a9fffba36b5067e83bf`.
FFmpeg commit `140fd653aed8cad774f991ba083e2d01e86420c7`, Emscripten
`09f52557f0d48b65b8c724853ed8f4e8bf80e669`; no claim of matching the old prebuilt.

`commit-files.json` is a curated explicit file inventory, not a staging command.
It separates new runtime/build/tests, new QA, prior backend proof and corresponding
source inputs. It excludes installed SDK/toolchain/cache trees and raw PATH logs.
Root owns `licenses/audio-source-*` publication and corresponding source/relink
review; these root-owned outputs are listed only as dependencies. Modified MPL
bridge/wrappers, exact LGPL FFmpeg source/configuration, static libraries/bridge
object and build/relink instructions, notices and toolchain sources must remain
available to recipients. No distribution waiver or public activation is made here.

