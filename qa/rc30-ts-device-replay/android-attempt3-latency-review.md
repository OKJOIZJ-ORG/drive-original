# Android attempt3 latency review

Same-file source30 functional replay completed and cleanup settled. Seek50, seek90 and reopen retain their15s failures. This review performed no device/browser/network operation and changed no product.

| Phase | Presented target seconds | Buffering first observed seconds | 15s |
|---|---:|---:|---|
| startup | 14.222 | 9.315 | pass |
| seek50 | 19.799 | 16.009 | fail |
| seek90 | 16.002 | 12.831 | fail |
| nearEOF | 9.409 | 6.156 | pass |
| reopen | 16.002 | 12.565 | fail |

The decisive latency region is before target positioning: seek50/90 enter the current TSgeneration within0.230/0.327s, but buffering first appears at16.009/12.831s. Native seeking→seeked itself is only79/99ms. Loadeddata coincides with the eventual presented target, so a fast already-presented target hidden by delayed UI readiness is not supported by this attempt. Sample milestones are periodic observations, not exact append timestamps.

No resource header/body timings, probe-window count or parser/worker CPU duration was recorded. Network/Drive latency versus parser/worker work therefore remains unknown. The code establishes a serial metadata-preflight→Rangebody→metadata-postflight path for every read, including repeated sequential head/tail/target discovery. Media sources are byte-identical between source30aa46bd0 and source314a484e6; the app/auth layer changed, so source30 timings are not source31 proof.

A narrow candidate is to pass the already admitted same-generation selected-window suffix to the existing bootstrap/worker path instead of rereading it from bootstrap.readStart. Current probe reuse supplies bootstrap construction, but the subsequent playback loop fetches those source offsets again. Preserve current reader/content/account/generation/checksum fences, ≤1MiB source reads, ≤64KiB pushes, credits/ACK backpressure, original offsets and cleanup; release bounded owned bytes and reject reader replacement. This structural redundancy is proven by code, but its actual time cost is unknown. It addresses only part of the3–5s after probing, while the larger opening region needs passive per-stage timestamps first. No implementation is proposed from an assumed network cause.

The earlier PC same-file observation is a single different-device/profile run: startup14.160s, seek5014.305s, nearEOF9.601s, reopen12.885s. It provides context, not statistical regression evidence. Exact last original frame and audiofidelity remain unknown/not tested.

Evidence: android-same-file-replay-attempt3-result.json SHA25634d419002a1ad6851728ca69a458b511bb6482ccc5e97a5c035974bffb2b0e08; producer and source hashes are in the JSON review. Relevant canonical code: media/drive-source.mjs readMeta/read; media/ts-player.mjs probeTsSeek/onInput/positionTarget/workerloop; qa/v2-07b-ts-q1/ts-seek.mjs sample andedge/targetsearch; seek-bootstrap.mjs configuration/readStart.
