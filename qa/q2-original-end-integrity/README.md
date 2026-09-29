# Q2 original audio-end investigation

No end-padding conversion patch is promoted. A small **MSE consumer** correction
is demonstrated on Chrome153.0.8010.54 for the retained EAC3/stereo48k fixture:
`appendWindowEnd = originalPresentationEnd + actualOpusPreSkip / 48000`.
This is a target-specific integration candidate, not universal codec support.
The existing final `audioConfig.description` supplies the real OpusHead; its
little-endian uint16 at offset10 is312 in this measured native encoder output.
No fixed312 constant belongs in general product code.
With the general-player mapping, the candidate expression is
`w.sourceEndTimestamp - mapping.commonShift + preSkip / w.audioConfig.sampleRate`.
Validate OpusHead signature/version/channels/rate and apply before appending;
do not infer the preSkip from a hardcoded codec name. Full-start is demonstrated;
seek-window PCM proof remains required and was handed to the app owner directly.

## Actual decoded PCM, not just container duration

`capture.cjs` and `capture-compensated.cjs` append the unchanged, accepted Q2
output to actual Chrome MSE. A MediaElementAudioSource feeds an AudioWorklet and
MediaStreamDestination, with **no connection to speaker destination and no volume
change**. Stereo float PCM is captured at48kHz. The source is independently
decoded by system FFmpeg only for the offline oracle. No browser codec is mocked.

| Actual MSE path | End relative to original288000 frames | Result |
| --- | ---: | --- |
| No end bound | 289352 | 1352 extra audible/nonzero decoded frames |
| appendWindowEnd=6 | 287688 | Incorrectly removes312 original frames |
| appendWindowEnd=6+312/48000 | 288000 | Exact retained source window; zero after it |

`capture-oracle.json` verifies alignment offset0, about43.44dB signal SNR against
the original lossy-codec source, exact equality of **all first288000 stereo float
frames** between compensated and unclipped native output, preserved final source
sample, and zero post-source output. This is not a bit-perfect source-audio claim.
The nonzero-end test uses a known non-silent chirp fixture; it is not a generic
silence detector for arbitrary files.

The compensated MSE element duration is6.0065s while the original presentation
duration is6s. App controls must retain original time. The existing logical pause
at6s needs explicit coordination before this candidate is activated; do not
claim it preserves the final hardware-presented samples merely because the
displayed clock ends at6. No hardware speaker/physical-device proof was performed.
AC3, seek-window reset, varied lengths/preSkip values and additional runtime
profiles still need the same PCM boundary qualification before broader adoption.

Chromium's inspected [FrameProcessor source](https://github.com/chromium/chromium/blob/main/media/filters/frame_processor.cc)
attempts partial audio append-window trimming (lines1042–1053), sets end
`discard_padding` (720–741), and keeps the crossing coded packet. This explains
why whole-frame dropping is not inevitable on this target. The fetched `main`
source is explanatory and hash-bound locally; it is not claimed to be the exact
source revision of installed Chrome153. Native output is the target evidence.

## Rejected encoded-file solutions

The [Opus ISOBMFF draft](https://opus-codec.org/docs/opus_in_isobmff.html), sections
4.3.4 and4.4, describes final-sample duration and edit-list trimming. We tested:

- Baseline: FFmpeg and Chrome decodeAudioData both return289608 frames.
- Trim input PCM to the source end, then shorten final Opus MP4 packet duration:
  final packet timestamp5.994667/duration0.005333, MSE duration about6s, but both
  independent decoders still return288648 frames. This includes256 source-preroll
  frames plus392 unwanted end frames. Container extent is insufficient proof.
- A finite6-second edit duration was independently tested with FFmpeg and still
  did not remove the decoder tail. The earlier `edit-duration.mp4` accidentally
  used6000 ticks at a57600 movie timescale; it is retained as an invalid6-second
  trial, not accepted evidence. `correct-edit-probe.json` records the corrected
 345600-tick trial. Its native Chrome rerun is explicitly not claimed until run.

`candidate-short-sample.mp4` restores the known original zero edit duration in
the retained single-field edit experiment; this recovers the tested shortened
packet candidate after a subsequent full-product driver reused output-eac3.mp4.
`restore-trial-artifact.py` makes that recovery explicit. Experimental `pipeline.mjs`
uses direct packet-field mutation only in QA, not in the product. No video encoder,
downmix, resample, server relay, or whole-file application processing was added.

This does not prove that every possible MP4 representation is impossible. It
rejects the tested bounded metadata fixes and identifies a demonstrated, smaller
consumer-layer path on this Chrome target. Root/app owner owns that integration.

## Current source repair and evidence correction

The prior final preparation report must **not** qualify the late strict-color
guard. That guard required primaries/transfer in public decoderConfig.colorSpace,
where this pinned core exposes only matrix/fullRange. An unhandled native-driver
failure prevented a fresh report, and the old finalizer wrongly reused a prior
success. The failed current-source observation was `AUDIO_VIDEO_COLOR_UNQUALIFIED`,
zero opened/native contexts, one65536-byte discovery read, no output. This fact is
retained in `rejected-current-source.json`; it is a reconstruction of the retained
tool observation, not a fabricated complete machine log. Historical manifests
are left unchanged and the earlier final status is explicitly invalidated.

Product changes in this unit correct that guard and preserve digit-bearing fixed
error codes (`AUDIO_STEREO_48K_REQUIRED`) through pipeline/Worker sanitization.
The app owner additionally owns narrowly authorized private-safe phase/error-kind
diagnostics in those two files. No raw error message, stack, account identity or
decoder config is placed in the diagnostic.

`run-fresh.cjs` requires child driver exit0, a new unique run ID, all13 completed
cases, no page errors, and matching before/after hashes for runtime **and producer**.
`fresh-validation.json` records the passing repaired-source run, including an
actual5.1 rejection asserting its exact digit-bearing fixed code. A later
diagnostic-only source change may make that snapshot differ from the final files;
the final manifest records the comparison explicitly. The app owner's cold-worker
investigation remains separate; this local13-case pass is not a claim of stable
full-app cold initialization. Current Node backend/admission/Q1 tests pass26/26.

No app/general-player/SW/version/public-list/Git/deployment edits were made here.
All Chrome sessions are isolated synthetic QA; shared/private profiles are untouched.
No padding feature was publicly activated. The accepted original75/128 manifests
and historical Q2 producer leaves were not edited.

Root subsequently placed a hold on new browser/compile work after measuring
severe host commit pressure. All this agent's tracked native drivers completed
their browser/server close barriers; the exact stalled PowerShell helper sessions
were interrupted. No personal/shared browser or unrelated process was stopped.
The final diagnostic-only runtime snapshot is therefore intentionally marked
not browser-requalified; the app owner's cold-start counterexamples remain open.
