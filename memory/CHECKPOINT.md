# Checkpoint — V2-03B closed / paused before V2-03C — 2026-09-19 22:04 KST

## The story so far

The v3.0 integrated spec remains the single execution authority on branch `codex/v2-kickoff-diagnostics`; V2-03A is committed at `44be198`. V2-03B is now closed on the exact read-only sample. FFmpeg mapped its sole H.264 High L3.0 video and AAC-LC stereo audio streams to MP4 with both marked `(copy)` and a fast-start `moov`; the codec, dimensions, frame rate, pixel/color fields, sample rate, channels and packet counts remained aligned. Early, middle and near-end decoded video-frame sequences and PCM windows matched. The maintained `browser-probe-server.mjs` v2-03b.2 served only the ignored derivative through a random per-run capability path with loopback Host/port, Origin and same-origin referrer enforcement; its 9/9 deterministic tests passed. The secured exact rerun in Chrome 152 returned six valid 206 Range responses, presented frames after all three seeks with `readyState` 4, exposed one captured audio track and increased decoded-audio bytes. The exact current app still fails the original TS-under-`.mp4` bytes, so this sample's first failure is container/packaging and Q1 fixes it on the tested Windows Chrome without video or audio re-encoding. This is not yet an iPhone/PWA or general-format result. The source fingerprint stayed unchanged; the temporary derivative, tabs and servers were removed. Drive data, production, `main`, remotes and paused automation remain unchanged.

## Decided

- D-050 and the v3.0 spec remain in force; browser/PWA and direct original transfer remain the product path.
- V2-03A and V2-03B are `IMPLEMENTED_LOCAL`; their same-file evidence does not justify a media relay or native product deployment.
- Q1 is confirmed only for the exact MPEG-TS/H.264/AAC sample on Windows Chrome; physical iPhone/PWA and the wider format matrix remain unverified.
- V2-03C is the sole READY unit; it must choose the minimum browser/PWA data/auth responsibility split before product implementation.

## Waiting on the user

- Work is paused at the user's request before V2-03C. Resume only when the user returns.
- Physical iPhone Chrome/PWA checks remain deferred until a runnable product candidate exists, when the exact URL/version and two or three checks will be supplied.

## Next first action

Complete the V2-03C adoption matrix from the V2-03A/B evidence, recording direct Drive data ownership, minimal free serverless authentication ownership, costs, migration and rollback while explicitly rejecting a media relay and native deployment unless later evidence changes the gate.

## Tried

- Managed automated Chrome login was rejected; ordinary Chrome succeeded, so that was not an app/account failure.
- The exact current app waits for the entire OPFS body on this 198 MiB desktop sample before first frame; the cold run took 370 seconds and still failed only after full transfer.
- Raw Drive `files.version` changed with server/view state while content revision/checksum/size stayed fixed, so content comparisons use the private content fingerprint rather than `files.version` alone.
- The first exact-module comparator attempt passed a `Headers` instance into `driveFetch`; its object-spread merge dropped `Range`, Drive returned 200, and the comparator correctly marked all three intervals inconclusive. The final recorded rerun used the documented plain header record and returned bounded 206 responses.
- Front/middle/tail SW and direct API sampled bytes were identical; this does not prove unsampled whole-body fidelity, but it supplies no evidence that a server media relay would distinguish this failure.
- Whole-file and raw demuxed packet hashes differ across MPEG-TS and MP4 because container/bitstream wrapping changes; they are not re-encoding evidence. Explicit copy mappings, equal stream parameters/counts and equal decoded windows supplied the Q1 proof.
- A single precise middle-frame input seek selected a different indexed frame across containers; bounded decoded sequences around early/middle/near-end positions matched and avoided treating seek-index behavior as content loss.
