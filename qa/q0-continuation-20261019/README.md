# Q0 moov-at-end head continuation — D101 assessment and prototype

Branch `claude/q0-moov-continuation-20261019`, rebased onto main `cc05f87` (production 1.23.11). Not merged, pushed or deployed. Measured in actual Chrome against a local Drive-like server (below), not against production Drive.

## Problem (observed in D100, qa/video-startup-20261019)

For moov-at-end MP4/MOV, Chrome reads the head (`bytes=0-`), requests the tail (moov), cancels the head stream and then re-requests from ~32 KiB. Each Drive range request pays ~0.85–1.2 s TTFB, so the restart is a third serial wait (+1.0–1.2 s) on files #16, #9 and #6.

Because SW response bodies are pull-based (`highWaterMark: 0`), the bytes Chrome dropped at the head cancel had already been pulled from Drive. Continuing upstream after the cancel is therefore not enough on its own: the emitted head bytes must also be retained.

## Change (sw.js only)

1. `tapQ0Continuation`: for a Q0 pinned GET whose verified response is the whole file from byte 0 (`bytes=0-` → `bytes 0-(size-1)/size`), copies of the emitted bytes are recorded while they total ≤ 4 MiB. Beyond that the record is dropped and the stream behaves as before.
2. On a page-side abandonment of that one request — the response stream cancelled by the consumer, or `request.signal` aborted (`owner.pageDetached`) — while the generation is still current, the live upstream reader is parked instead of cancelled. A read that is pending at that moment is consumed by the park, so no byte is lost or duplicated. Explicit Q1/Q0 retirement (generation retired first), first-byte/no-progress timeouts and length errors still cancel, because they call `retire()` without the page-detached mark.
3. The park is registered as its own `q1TransportOwners` entry *before* the page-side cancellation resolves, so `replyQ1Retirement` always finds, cancels and joins it. It keeps reading until 4 MiB total, then backpressures. It lives ≤ 10 s and there is one per client (a newer park disposes the older one). Disposal cancels through `fenceQ1RejectedBody`, so a failed cancellation is sticky exactly like any other rejected body. A finished or errored upstream is only released.
4. `adoptQ0Continuation` runs at the point where `proxyDriveMedia` would call Drive, so the follow-up request has already passed the owner handshake, the cleanup fence, the pin lookup/validation and the credential reauthorization. It adopts only when all of these hold: an open-ended `bytes=N-`; the same Q0 owner tuple (client, file, media session, source generation, account key/generation); the same pinned URI and resource-key header; the same size; and `N` inside the bytes already buffered. The synthetic 206 (`Content-Range bytes N-(size-1)/size`, `Content-Length size-N`) then goes through the unchanged Range/Content-Range/pinned-length checks and `instrumentMediaResponseBody` length and timeout enforcement. The caller's transport signal is linked to the adopted body, just like a fresh fetch. Anything else falls back to an ordinary Drive request. The trace shows `request-start` with `reason: 'continuation'`.

## Contracts kept

Original bytes only: the same pinned revision bytes, verified once by the head response and again by the existing checks on the synthetic range. The credential is reauthorized for every request. It holds no cache: memory only, ≤ 4 MiB, ≤ 10 s, one park per client. Q1 retirement, fences and cleanup confirmation all apply to the park. app.js and the license-pinned media are unchanged. No auth/origin/Notion/automation change.

## Local actual-Chrome experiment (observed)

`local-chrome/`: `server.js` serves the candidate worktree and two moov-at-end MP4s (978938 B / 15358676 B, first keyframes 80 KB / 255 KB) with 900 ms TTFB and ~10 MiB/s per request. Chrome 155 (dedicated AI profile) runs the real candidate `sw.js`; only the page owner reply, credential and pin are replaced by local fakes (`exp-sw-cand.js`). The baseline is the same SW with the tap/adoption disabled (`exp-sw-base.js`), on a separate origin. Three alternating opens per file per mode; raw lines in `local-chrome/results.json`.

| | Upstream requests | src → `currentTime ≥ 1 s` |
|---|---|---|
| Baseline (6 opens) | 3: head `bytes=0-` closed after 104858 B, tail at +0.93 s, restart `bytes=65536-` at +1.87 s | 4106–4162 ms |
| Candidate (6 opens) | 2: head, tail; restart `bytes=65536-` served by the continuation in all 6 | 3189–3214 ms |

- Confirmed in Chrome 155: abandoning the head reaches the SW stream before the restart arrives, the restart offset (64 KiB) is inside the recorded head bytes, and the request pattern exactly matches D100's production observation.
- Saving ≈ 0.93 s per moov-at-end open, i.e. one TTFB, for both sizes.
- The rVFC first-frame times (≈ 3.0 s in both modes, one 2.0 s) were held back by the compositor of the shared, non-front AI Chrome window. They contradict the `currentTime` progress, so they are not used for comparison.
- Not covered: real Drive (HTTP/2, real TTFB variance), mobile/WebKit, and the ≤ 4 MiB/≤ 10 s waste when a parked head is never adopted (unit-tested only).

## Expected saving in production (assumed)

On moov-at-end opens the restart request skips one Drive TTFB, ≈ 0.9–1.2 s of the 4.4–4.6 s (D100 candidate tap) click→first-frame on #16/#9, and probably less on #6. For files ≤ 4 MiB (#16) the restart is served entirely from memory. Faststart files are unaffected: they have no cancel, or a cancel after 4 MiB.

## Risks / unknowns

- Resolved locally (Chrome 155, see above): Chrome does signal the head abandonment to the SW before the restart. Still UNKNOWN on other engines; there, nothing parks and behavior equals today.
- Extra Drive transfer ≤ 4 MiB per parked head that is never adopted (for example, closing the player right after the head), and the upstream connection is held ≤ 10 s. Limited to the byte-0 head, so seeking and scrubbing never park.
- Up to 4 MiB of copied memory per active head stream until it passes 4 MiB.
- The restart offset must already be buffered. A restart that arrives before the park reaches it falls back to a normal request; correct, but no saving.
- A new transport path in the SW: hard to see in production except through the existing trace stages.

## Verification

`node --test tests/*.test.js tests/*.test.mjs`: 967/967 (959 + 8 new in `tests/q0-proxy.test.js`): adoption after stream cancel; adoption after caller abort with a read pending at cancellation (bytes delivered exactly once); closed and outside-window ranges fetch normally; retirement cancels and joins the park; expiry cancels and clears the fence; explicit retirement of a live head cancels instead of parking; a head past 4 MiB cancels; closed, suffix and non-head heads never park. One unrelated flake was seen once in `native-color.test.mjs` (mux timestamp byte 131/132) and passed on two reruns. `node --check sw.js`, `git diff --check` clean.
