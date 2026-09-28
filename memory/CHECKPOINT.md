# Checkpoint — core integration and player completion — 2026-09-29

## The story so far

Canonical source C:/extensions/Drive-Original/source, branch codex/v2-kickoff-diagnostics,
HEAD3fa5914. Core AUTH partial-grant/verified-regrant and delayed seek-presentation fixes
are committed locally. Full381 passed before the last AUTH repair; focused AUTH30 then
passed. Final integrated suite is pending. Actual candidate remains b9d8739/rc.11,
Worker fe556d43; production v1.21.0/e08989a unchanged. Actual WebM playback/seek/EOF and
4.6GB ISO first frame before whole body passed. ISO50/90% seek false recovery was
reproduced with native frames advancing; local fix awaits candidate replay. Actual
MKV/AVI-declared TS failures discriminate5tick phase and rational21fps clocks.
Astra's observed-clock/final-fragment-duration Q1 extension is ready:133Q1/20static,
synthetic payload/frame/PCM/time conservation; root integration/live replay next.
Sol owns UI chrome/gesture/poster patch and real local DOM checks; another Sol owns
bounded generic remux QA foundation, no shipping integration yet. Baseline69-row
qualification24passed/39not-run/4blocked/2N/A and fixed19-file rc.11 ZIP are preserved,
not final acceptance. Actual evidence validator8/8 passed. Browser275137375 is gallery,
player/source absent, retirement settled and all root QA handles/groups released.

## Decided

- D-061 resumes original work after reboot; D-062 authorizes autonomous/proactive completion while user sleeps.
- D-059 keeps original core first; a coherent AUTH/seek unit is saved, queued UI implementation now proceeds alongside core format work.
- D-056 pause without overlay is intentional; designated reveal region preserves playback.
- D-057 distinguish desktop touch, Android emulator/device and iOS; no sleeping-user test handoff.
- D-050/D-051 allow local changes, free candidate deployment, own appData and bounded new disposable QA; no main merge/push/production, original-media changes/new grants/payment/permanent delete/automation restart.
- Volume/output settings untouched; protected private backups remain ignored/untracked with existing restricted ACL.

## Waiting on the user

No input needed for executable work. Physical-device and production authorization boundaries remain explicit and do not stop independent local/candidate work.

## Next first action

Read qa/v2-07b-ts-q1/video-clock.mjs and fragment-clock.mjs, review Astra's exact clock/duration fences, and integrate the ready Q1 unit without touching Sol's active app/UI hunks.

## Tried

- Actual tab operations never caused native hidden state;30s PC return remains unperformed.
- Browser.getHistograms/getWindowForTarget/TargetsetAutoAttach unsupported; do not repeat.
- Initial whole-moov2MiB probe rejected23MB index; sparse track probe now completes38GET/1375bytes.
- Global integer CFR grid rejected valid5tick phase and rational21fps; observed timestamps and independent mux duration binding are now implemented locally.
- Generic MKV packets can lack duration; Q1 spike fails unknown audio duration explicitly, not invented preservation.
- Normal disposable UI remains intentionally write-locked; restricted QA proof is not broad UI proof.
- Historical299s read failure and A-012/A-013 causes remain unknown despite later scoped passes.
- Raw CRLF staging inflated tracked diffs; git add --renormalize on exact tracked paths corrected it; raw ignored evidence preserves producer hashes.
