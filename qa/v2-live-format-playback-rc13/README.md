# Actual rc.13 format replay

Fixed candidate `570f9c38506d1e426c33cf65b73836d32bf872c0`, app/SW `1.22.0-rc.13`. Existing normal user session and grants were used by root for original Drive reads. This documentation unit made no browser/media/account/volume changes and preserved every raw result JSON. No private filename or pixels are added.

The declared-MKV sample now starts on original Q1 with decoded video/audio counters, 360x640 dimensions and no native media error. Both 50% and 90% replay targets have fresh presented-frame evidence near the requested scene; the 90% paused target subsequently resumes to duration55.877188s and natural EOF. The50% observation also reaches the end. These samples cover the prior init failure repaired for valid explicit non-square SAR; they do not establish every MKV codec/container combination.

The declared-AVI sample starts and naturally reaches159.164188s. A50% seek from the ended/paused state presents the requested79.582094s scene, then trusted Space resumes playback; the next recorded sample advances to136.744306s with increased decoded-frame/audio counters. The90% request starts during playing, presents the143.247772s target and continues to natural EOF. During Q1 reconstruction the video temporarily becomes paused; that intermediate state is preserved in the raw observations.

| Seek | Target seconds | First target-frame observer elapsed | Presented media time |
| --- | ---: | ---: | ---: |
| MKV50% | 27.938594 | 14.826s | 27.915900 |
| MKV90% | 50.289469 | 13.098s | 50.271588 |
| AVI50% | 79.582094 | 15.454s | 79.545144 |
| AVI90% | 143.247770 | 15.714s | 143.211811 |

These13–16s observation latencies are not fast seeks. The passive helper starts before the interaction, so they are observer-start-to-frame values rather than exact pointer-to-frame measurements. Decoded audio bytes prove decoding activity, not audible sound. No physical Android/iOS or full uninterrupted playback of all files is claimed.

Both normal closes reach readyState0, selected/Q1false and settled retirement with sources cleared. `avi-close-results.json` explicitly records all temporary helpers cleared and object groups released. The MKV raw close stores `src:false` and `source:false`; its `source` field means source-child presence, not Git provenance. MKV belongs to this fixed replay through surrounding source-tagged records and root's handoff. MKV helper/group cleanup is root's completion attestation; it is not an explicit field in that close JSON.

Five passive producer expressions are exact byte copies from the rc.12 leaf: sample, trace, native events, seek presentation, worker errors. Their original SHA-256 values and raw result hashes are in `qualification-summary.json`. They remain passive observers with bounded collection and explicit cleanup. Run `node qa/v2-live-format-playback-rc13/verify-records.cjs` to check the existing records and producer identities without replaying the browser. It checks presented target frames rather than relying on clock advancement alone.
