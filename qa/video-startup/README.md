# Video startup priority — D089

Local branch `codex/video-startup-optimization`, based on D088 `523cae2`. The user requested faster video loading while retaining KISS. This unit adds no dependency, format conversion, cache or transport path. Production remains the D086 1.23.3 baseline; no version bump, merge, push or deployment was performed.

## Diagnosis and change

Source inspection found that `openPlayer` could start neighbor thumbnail warming and complete-population collection while the selected video was still acquiring its original source. D088 also introduced ordinary sequential metadata collection. These background consumers can compete with startup. Actual concept replays below observed two or three catalog starts before the first decoded frame in baseline mode.

`isVideoStartupPending()` reuses the visible player/loading state and `isVideoPresentation()`. Both the automatic metadata scheduler and `warmPlaybackNeighborhood` wait while it is true, including source preparation before the video element becomes visible. The existing current-owner presentation function releases background work after the first frame. Image readiness handles a file declared as video but admitted as raster; close resumes ordinary collection. Queued scheduler callbacks recheck the guard, and stale source/frame owners cannot release work. Neighbor images set `fetchPriority='low'`, an advisory browser hint ([primary guidance](https://web.dev/articles/fetch-priority)); unsupported browsers retain ordinary loading.

Already-running requests are allowed to settle. Explicit full-population navigation remains available during startup; stable previous/next order and complete random decks are preserved. Existing player-lifetime thumbnail extraction suspension remains active after the first frame. Q0 credential, immutable revision pinning, authorization, original-byte/Range safeguards, concurrent audio admission and raster repair are unchanged. They provide source correctness and format behavior and were not removed to shorten a timer.

## Actual normal-Chrome concept experiment

On 2026-10-08 the existing authenticated production tab played one short clip from `Samsung_Videos` under `ㅇㅎㅎ`. Temporary in-page wrappers retained actual original source acquisition and native decoding, counted catalog starts and deferred background work. This was a concept experiment on old production, **not execution of the exact candidate**: production's original scheduler still had its viewport gate, and the candidate image priority hint was absent. No credential was exported. File identities/names and source URLs are omitted from the maintained [sanitized measurement record](actual-concept.json).

The clock began at the ordinary card pointer event; the end was a native first decoded-frame callback. Runs2–6 verified the same selected file in-page. Run1 established the initial selected clip but has no separately retained ID-equality assertion.

| Run | Temporary mode | First frame (ms) | Catalog starts before frame |
|---|---|---:|---:|
| 1 | Baseline | 6022 | 2 |
| 2 | Baseline reopen | 9389 | 3 |
| 3 | Neighbor warming deferred only; exploratory | 6396 | 1 |
| 4 | Baseline repeat | 9154 | 3 |
| 5 | Automatic catalog and neighbor warming deferred | 9089 | 0 |
| 6 | Same combined deferral | 4798 | 0 |

Observed benefit: the two combined-deferral replays started no catalog request before the decoded frame. Startup varied from4.8–9.4seconds; cache, run order, provider/network response and cold state were not controlled. These observations **do not establish a faster average, percentage improvement or upper bound**. Warming-only mode left one ordinary catalog request before frame and motivated guarding both entry points.

One final diagnostic trace assigned the media source at5ms, reached native metadata at4631ms and first decoded frame at4743ms after media intent (a different origin from the pointer clock). This suggests substantial waiting in original acquisition/response rather than source assignment, but multiple native/probe requests were not individually correlated, so no specific provider/revision/audio hop is declared the bottleneck. Immutable revision preparation and audio repair remain intact. Historical45second cause is still UNKNOWN.

Cleanup verified: original function references restored, temporary pointer/media listeners and frame probe removed, diagnostic trace ended and previous sink restored. Player was closed and the tab returned to its initial `ㅇㅎㅎ` folder. Ordinary playback can record viewed state through the established app behavior; no original media mutation, preference/auth/security change or production code change was made.

## Exact local candidate verification

- Final product suite: **922/922 pass**, zero failed/cancelled/skipped (`node --test tests/*.test.js tests/*.test.mjs`). `node --check app.js` and scoped whitespace check passed. Focused tests distinguish deferred automatic work from explicit full-deck work, valid/stale presentation, close, raster fallback, full order and retained player thumbnail priority.
- Maintained driver: `node qa/video-startup/native.cjs`, using the existing QA Playwright dependency. Isolated native Chrome at1440×900 and390×844 decodes the existing202253-byte local MP4. The actual app owns opening, loader, presentation, rendering and catalog continuation; only source acquisition and458+1593 metadata are synthetic. Remote requests and service workers are blocked; no credentials, real Drive/Q0 authorization or physical-device proof.
- Before response release: loader visible, decoded frame absent, **0 catalog / 0 neighbor starts**, cards240. After actual decoding: background work resumes after the callback,2051media complete, full deck, <=240cards/no overflow, player thumbnail priority still active. Separate close-before-response resumes collection; a synthetically invoked stale callback does not warm neighbors. Both viewport cases pass with no page error or remote request.
- [Native receipt](native-results.json) hashes match current `app.js`, `styles.css`, `index.html`. Its `performance.now()` timestamps include page bootstrap/held response and are **not startup-speed benchmarks**. Outputs: workspace `maintenance/tools/video-startup/product-tests.log`, `native-results.json` and `{1440,390}-{pending,ready}.png`; captures were visually inspected. Mobile viewport is emulation.

Initial native setup failures (missing fixture abort owner and8second bootstrap deadline shorter than the existing readiness wait) were fixed in the driver; the failed receipt remains in `maintenance/tools/video-startup/native-results-fixture-setup-failure.json`. Successful checks do not qualify actual candidate-account, production, physical Android/iOS, all formats or sustained playback. A controlled candidate speed comparison remains unknown, not an active unattended queue.
