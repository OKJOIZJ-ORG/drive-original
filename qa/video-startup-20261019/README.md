# Video startup measurement and revision-pin prewarm — D100

Branch `claude/video-startup-perf-20261019` from main `a29b658` (production 1.23.10, Worker 02b55d4c). Not merged, pushed or deployed.

## Method (observed)

Actual signed-in normal Chrome (user profile through the shared chrome-devtools host, own background tab, closed afterwards). Five liked videos chosen by size/layout; identities omitted. The app's own diagnostic sink (`__driveOriginalMediaTraceSink`, which also carries the SW `MEDIA_TRACE_EVENT` stages), media element events, `requestVideoFrameCallback` and resource timing were read; no production logging was added. Each open is an ordinary card open (`pointerdown` → 100 ms → `pointerup` + `click`, the "tap" gesture) or a mouse hover (`pointerenter`, 400 ms dwell, then the same press). The player was closed between runs; likes, files and settings were not changed; the filter was restored to 전체 and likes stayed 20.

| # | Size | Layout (observed) |
|---|---:|---|
| 16 | 0.9 MB | moov at end: head, tail, restart (3 range requests) |
| 19 | 6.8 MB | faststart (1 request) |
| 9 | 15.1 MB QuickTime | moov at end (3 requests) |
| 10 | 232 MB | faststart (1 request) |
| 6 | 807 MB | moov at end (head, tail, continuation) |

## Baseline phase breakdown (production 1.23.10, 25 opens)

| Phase | Typical | Notes |
|---|---:|---|
| press/click → SW credential ready | ~30 ms | credential already in SW; never a bottleneck |
| Q0 revision pin (metadata → download POST → metadata, serial) | **1.42–1.52 s** (one 2.0 s, one 5.8 s outlier) | three ~0.48 s Drive JSON round trips on every open |
| first range request → headers | 0.75–1.2 s | Drive media TTFB; pinned revision URI and plain `alt=media` measured equal (~0.84 s) |
| moov-at-end tail request | +0.9–1.2 s | Chrome reads the tail after the head bytes |
| restart from 32 KiB after the tail | +1.0–1.2 s | Chrome cancels the head stream and re-requests |
| metadata → first painted frame | 0.05–0.4 s | decode/presentation |

Concurrent but not on the critical path: the audio-probe reads (two metadata reads and a 12-byte/64 KiB range through the SW, Q1 modules) and periodic account-state reads (`about`, appDataFolder).

## Change

1. `media/revision-pin.js` `acquire({ revisionHint })`: when a listing `headRevisionId` hint is present, the exact-revision download POST runs in parallel with the first metadata read. The hinted operation is used only if that read names the same revision and no resource key; otherwise the ordinary sequential POST follows. The closing metadata read, drift/permission checks and URI validation are unchanged and still complete before any original byte is requested (existing "fails before any original bytes" tests unchanged).
2. Listing fields add `headRevisionId`; the page's Q0 owner reply carries it as `revisionHint`; the SW validates its format and passes it to `acquire`.
3. Card intent prewarm (`installCardPinPrewarm`, video cards only): mouse/pen hover dwell ≥150 ms or a primary press starts the same pin acquisition in the page. The SW's existing retained-pin `get` handshake adopts it: the page hands over a matching (file, account, account generation) pin at most once, ≤30 s old, joining an in-flight prewarm for ≤1.5 s (below the SW's 2 s handshake limit). The SW still validates the pin, binds it and reauthorizes the credential before range bytes. Demo, images, download-restricted files and missing read capability never prewarm.

## Results (same files, same tab and session)

Measured by injecting the exact candidate page code into the production page (in memory; production SW unchanged, so the SW-side hint path below was not exercised live). The listing `headRevisionId` field was simulated by one metadata read per file before the runs.

Click → first painted frame, median of 3 (ms):

| # | Baseline tap | Candidate tap | Δ | Candidate hover (400 ms dwell) | Δ |
|---|---:|---:|---:|---:|---:|
| 16 (0.9 MB, moov end) | 4988 | 4393 | −595 | 4191 | −797 |
| 19 (6.8 MB) | 2655 | 2064 | −591 | 1922 | −733 |
| 9 (15.1 MB, moov end) | 4973 | 4590 | −383 | 4581 | −392 |
| 10 (232 MB) | 2635 | 2079 | −556 | 1694 | −941 |
| 6 (807 MB, moov end) | 3746 | 3012 | −734 | 2729 | −1017 |

Press → first range request start: baseline 1.52–1.66 s (one 5.9 s outlier); candidate tap 0.95–1.29 s; candidate hover 0.62–0.65 s after the click in typical runs. Pin acquisition alone, page micro-benchmark (8 each): hinted median 1010 ms vs sequential 1494 ms (−484 ms) — the expected saving of the SW path when no prewarm exists (player next/previous, keyboard).

Raw lines: [results.json](results.json).

## Not changed / remaining

- Per-request Drive media TTFB (~0.85 s) is provider-side; the revision URI is not slower than plain `alt=media`.
- moov-at-end files still pay two extra serial range requests (~2.0 s). A bounded SW continuation of the cancelled head stream could save ~1 s; it is a new transport path and is left for a separate decision.
- Not verified: production SW hint path live, mobile touch timing on physical devices, WebKit.

## Verification

`node --test tests/*.test.js tests/*.test.mjs`: 959/959 (947 before; 12 new in `revision-pin.test.js` and `q0-proxy.test.js`). `node --check app.js sw.js`, `git diff --check` clean.
