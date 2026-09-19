# Checkpoint — V2-03A closed / V2-03B container test next — 2026-09-19 20:53 KST

## The story so far

The v3.0 integrated spec remains the single execution authority on branch `codex/v2-kickoff-diagnostics`; V2-01C is committed at `cfb81a5`. The localhost OAuth validation origin is registered alongside the preserved production origin and the ordinary-Chrome app is connected. Two exact-sample runs observed the declared 208,001,508-byte transfer count followed by `MediaError` 4 and `container-or-decoder`. V2-03A is now closed: the exact `range-comparator.mjs` v2-03a.4 module was imported from a temporary local source server into the authenticated app, and current-SW plus independent Drive API reads of the sampled front, middle and tail 65,536-byte intervals all returned 206 with exact lengths and matching in-page SHA-256 digests under one stable private content fingerprint. The SW exposed exact `Content-Range`; direct CORS hid it but paired sampled-byte equality was conclusive. This does not prove unsampled whole-body fidelity, but it found no sampled SW/upstream discrepancy and moves the next discriminating test to the observed post-transfer container/decoder boundary; this evidence does not justify a media relay. A reusable bounded comparator passed 16/16 focused tests; the unchanged product suite passed 153/153, syntax/diff checks passed, and the public build remained 12 allowlisted files. Local FFprobe identifies MPEG-TS under the `.mp4` name with H.264 High L3.0 video and AAC-LC audio, so V2-03B will test a Q1 container-only stream copy. The original, production deployment, `main`, remotes and paused automation remain unchanged.

## Decided

- D-050 and the v3.0 spec remain in force; browser/PWA and direct original transfer remain the product path.
- V2-03A is `IMPLEMENTED_LOCAL`; the current SW and independent API reader returned identical sampled bytes, so B-media relay is not adopted from this evidence.
- V2-03B is the sole READY unit; authentication work remains separate from media conversion.

## Waiting on the user

- Nothing for V2-03B. Physical iPhone Chrome/PWA checks remain deferred until a runnable candidate exists, when the exact URL/version and two or three checks will be supplied.

## Next first action

Use the installed FFmpeg/FFprobe against the read-only local mirror of the exact sample to create an ignored derived MP4 with stream copy only, then prove stream identity and test Chrome first, middle and near-end decoded frames, progress, seek and audio evidence without changing or uploading the original.

## Tried

- Managed automated Chrome login was rejected; ordinary Chrome succeeded, so that was not an app/account failure.
- The exact current app waits for the entire OPFS body on this 198 MiB desktop sample before first frame; the cold run took 370 seconds and still failed only after full transfer.
- Raw Drive `files.version` changed with server/view state while content revision/checksum/size stayed fixed, so content comparisons use the private content fingerprint rather than `files.version` alone.
- The first exact-module comparator attempt passed a `Headers` instance into `driveFetch`; its object-spread merge dropped `Range`, Drive returned 200, and the comparator correctly marked all three intervals inconclusive. The final recorded rerun used the documented plain header record and returned bounded 206 responses.
- Front/middle/tail SW and direct API sampled bytes were identical; this does not prove unsampled whole-body fidelity, but it supplies no evidence that a server media relay would distinguish this failure.
