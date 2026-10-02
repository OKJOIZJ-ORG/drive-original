# rc35/candidate matched color-path regression

This is one bounded OBS05 fixture-only release pair. The default command only verifies pinned Git objects and the existing generated fixture, writes `preparation-result.json`, and does not launch Chrome. Browser execution requires explicit `--run`; no actual-account, physical-device, normal-profile, production, cohort, p95, or strict-RGBA claim is made.

The fixture is `qa/fm05-controlled-diagnostic/subtitle.mp4`, SHA-256 `d9a1cc3f12a7a3b3a91f408e59da8e1f9b8dfb2e4ec26dd8d969cedc27893037` (659,966 bytes; six seconds; H.264 video, AAC track 2, `mov_text` track 3). It is pinned at both rc35 `2c2b1244bee0f1a5e500318c83c6e126c5124e34` and candidate rc37 `051dc3456f5000b958a18593848769b3687991e5` (includes `c7b4ed6`). The provider supplies identical synthetic metadata and fixture bytes. Each release is served from its pinned public Git assets in a fresh isolated context on the same launched Chrome 154 process; context caches start cold.

The single scenario observes Q0 native playback and pause, opens the ordinary track menu, selects AAC 2, then seeks to 2 seconds and the terminal frame near 6 seconds. Q1 captures require a new `requestVideoFrameCallback` presented frame after selection/seek, Q1 owner + session/account/service-worker generation binding, ready or buffered-to-end current transport/pipeline generation, matching mapped target, and pinned file identity. The receipt gates both release versions, every phase, current-frame proof, teardown/retirement, worker termination calls, zero page errors, and closed contexts/server/browser. Results are reserved with exclusive creation before browser launch and persisted as phases complete; each actual result gets a unique timestamp/PID/random filename.

The run records per-phase latency, synthetic-provider requests/bytes, pinned asset hashes, frame/tuple/layout observations, worker/resource snapshots, and cleanup. It only compares the candidate's reported output tuple to observed native-frame tuples and checks the same Q0/Q1 target. Direct YUV capture does not establish strict RGBA parity. Existing `strictRGBAFAIL` and Android `YUVUNKNOWN` remain unchanged. The mock exposes Content-Range, so this pair does not validate the separate real-Drive CORS-hidden Range path.

Preparation command:

```powershell
node qa/rc36-matched-regression/runner.cjs --prepare --candidate 051dc3456f5000b958a18593848769b3687991e5
```

The local pair command is intentionally explicit and must be separately admitted:

```powershell
node qa/rc36-matched-regression/runner.cjs --run --candidate 051dc3456f5000b958a18593848769b3687991e5
```

Bounds are one fixture, two releases, four observed phases per release, 15 seconds per phase, 60 seconds for the pair, 512 provider requests and 24 MiB per release, and Node RSS/heap ceilings. Launch and cleanup calls have finite timeouts; browser close escalates to its own launched process if close times out. Chrome aggregate memory is not sampled. A failed gate yields `FAILED_OR_UNQUALIFIED`, never a retroactive pass.


Root admission fixes: eagerly verify the existing Playwright module in preparation, use its documented BrowserServer.close/kill/process lifecycle, and keep each frame-gate rejection awaited without early unhandled process exit. The initial incorrect module path failed before any browser/provider activity and is retained in dependency-command-failure.json; no product/source changes or redeployment.

The separately admitted `series.cjs` now collected the preserved pilot plus19new serial pairs. `series-root-adjudication.json` owns finite20-pair descriptive latency/failure-inclusive bounds and limitations; `series-savepoint-manifest.json` pins allnew producers/preparations/receipts. Actual run completed and fullycleaned; do not repeat `--run` without a new material question. The unchanged single-pair runner and originalprep/pilot remain immutable.
