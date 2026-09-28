# PC output and priority playback after reboot — 2026-09-29

Observed, actual intended authenticated user Chrome, fixed candidate source
b9d873926e894bb89a9faa8e638f7f0a80c0eb7e/app1.22.0-rc.11. D-061 resumes work.
qa/v2-pc-return-postreboot-rc11/results.json owns exact producers and record hashes;
validate.mjs independently checks recorded assertions/redaction/producer equality.
Historical PC-OUTPUT-20260929.md remains unchanged; the exact pre-reboot lower audio
stage/cause is unknown. No output/volume/service/browser settings changed.

## Observed result

- Same actual-click-started half-second stereo48k PCM producer now ends at0.5s:
  metadata70ms, canplay/playing254ms, ended800ms, no error; blob revoked/helper released.
- Normal UI opens the supplied original priority MPEG-TS/H264/AAC file. Q1 trace
  reports first-decoded-frame13503ms after opening, then native readyState4/no error.
  Corrected sample39.705234s/1195decodedframes advances to77.531107s/2329frames.
- Passive requestVideoFrameCallback observer records90 presented callbacks,
  mediaTime77.954667→166.821333 with same owner/Q1/no error. Sampling stayed visible.
- Actual seek-bar ArrowRight requests+5s from191.834494 to196.834494; readyState4,
  four decoded frames/no error while paused. Enter on normal play button resumes,
  advancing to218.128236s/645decodedframes after the seek's native decoder reset.
- Normal close removes dialog/source/selection; Q1 false, retirement settledtrue,
  readyState0 and trace sink absent. All temporary observer/listener/object groups cleared.

## Retained limits and useful next work

Actual30s hidden-return was NOT performed: creating a separate tab, Page.bringToFront
and Ctrl+Tab produced no native visibilitychange/hidden state. Browser.getWindowForTarget
is unsupported. background-attempt-results.json retains the bounded90s visible observer,
so it cannot become a background/OS sleep-wake proof. Continue other executable core
work; do not hand off routine Chrome steps or claim that this tool gap passes the gate.

A pointer click on the normal "재생 제어 열기" button paused without revealing controls;
keyboard Tab revealed them. This is a fresh scoped observation for the existing queued
V2-02C/D controls-entry defect. It does not authorize revealing chrome on pause.

Native decoded counters, callback presentation, output audibility and physical devices
are separate. Trace is capped512events/180s; no complete traffic/walltime/whole-file/EOF,
new natural-expiry or historic299s cause claim. Initial read projection used nonexistent
selectedFile/previewContainer/playSession fields; excluded explicitly. Corrected samples
use actual selected/playbackSession fields and own conclusions.

No product, original media, general-write flag, production, automation or volume change.
Next core unit: bounded actual ISO track/codec proof and normal Q0 route playback.
