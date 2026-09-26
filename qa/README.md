# Browser QA

Runtime dependencies: none. These are development-only fixtures.

For v1.21.0, the functional driver also exercises bottom-only chrome, immediate
Tab focus, pointer-to-keyboard switching, independent player history, native
selection suppression and same-account renewal. The layout driver includes both
hidden and explicitly revealed controls (25 states per engine). Enter controls
through bottom input or Tab: hidden controls are intentionally inert.

The hardened acceptance driver blocks intercepted upstream requests while
offline; it asserts the remote store and peer did not change before reconnection.
Latest summarized evidence: `immersive-results.json`. Older candidate evidence
in `acceptance-results.json` remains historical and is not silently overwritten.

`node qa/upgrade-audit.cjs` verifies the actual v1.20.0 Git shell can update to
the current source using the real app update action, while preserving unrelated
storage and loading the new shell offline. Its profile/origin are isolated.

```sh
npm --prefix qa install
npx --prefix qa playwright install chromium webkit
node qa/browser-audit.cjs chrome-final
node qa/browser-audit.cjs webkit-final webkit
node qa/functional-audit.cjs functional-final
node qa/edge-audit.cjs
node qa/acceptance-audit.cjs
```

Chrome must be installed for the Chrome-channel runs. All OAuth and Drive responses used by functional tests are intercepted fixtures. No real media is moved or deleted. WebKit on Windows is not physical iPhone Safari proof. Reports and screenshots stay local under qa/ and are excluded from the Pages artifact.

`tail-index-h264-aac.mp4` is a self-generated 3-second H.264 Constrained
Baseline/AAC fixture for QA-TR-02. It is intentionally non-fragmented and keeps
its `moov` box after `mdat`; its size, SHA-256 and top-level box order are fixed
by `tests/static.test.js`. The browser audit inserts a valid 4 MiB top-level
`free` box immediately before `moov` in memory. This moves only the index, not
the earlier `mdat` or the sample offsets that point into it, and keeps the
checked-in binary small while forcing a discriminating tail access.

QA-TR-07 uses a separate one-byte `sparse-offset` fixture to exercise exact
2 GiB and 4 GiB offsets through Chrome and the production service worker. The
fixture keeps its physical payload at one byte while exposing a validated
logical total, so the audit proves Range forwarding, response arithmetic,
worker status/trace correlation, fail-closed malformed input, and cleanup
without allocating a multi-gigabyte file. It is synthetic browser-path evidence,
not proof of real Drive/CORS behavior, multi-gigabyte transfer performance, or a
physical iPhone/PWA.

`faststart-h264-aac.mp4` is a separate 10-second H.264 Constrained
Baseline/AAC fixture for QA-TR-01. It is non-fragmented, keeps `moov` ahead of
`mdat`, and has its size, SHA-256 and top-level box order fixed by
`tests/static.test.js`. The functional audit appends a valid 4 MiB top-level
`free` box after the complete seed in memory. A cold Chrome context receives
the immutable faststart seed over two bounded original Range responses, then
the audit holds the Range for the trailing `free` box after 96 KiB. Chrome must
present at least two seconds of increasing decoded media time while that third
production-service-worker response and the represented file remain incomplete;
closing the player must cancel or abort the held stream. The trailing box does
not move or rewrite `mdat` or its sample offsets.

The paired negative control inserts the same 4 MiB `free` box before the
non-faststart seed's tail `moov`. It withholds the last index byte under the
same cold browser path and must not produce a decoded frame or two seconds of
presentation. This distinguishes the faststart result from stale diagnostics,
poster readiness, or a test-only media bypass.

This is synthetic Chrome-to-production-service-worker evidence that a normal
faststart MP4 reaches Q0 and continues before the whole represented file is
downloaded, without OPFS, memory-buffer, preview, retry, or Playwright media
fulfillment. The complete small MP4 seed has arrived before the held synthetic
tail, so this does not claim decode from a partial `mdat`. It is also not proof
of real Drive or CORS behavior, native large-transfer throughput, or a physical
iPhone/PWA.

QA-TR-03 reuses that pinned seed in a fresh Chrome context to exercise the
product's seek lifecycle at 10, 50, and 90 percent (1, 5, and 9 seconds). Each
accepted target must produce exactly one `seeking`, `seeked`, and decoded-frame
`seek-frame` in the same media session, source generation, source URL, and
diagnostic trace. A synchronous 25-to-90-percent supersession must leave the
older generation without a late terminal or fallback event after a bounded
grace period. Increasing Chrome video-frame and AAC decoded-byte counters plus
one `captureStream()` audio track are decoder/track evidence; they do not prove
physical audible output.

The entire 202,253-byte MP4 seed is already received before these seeks, while
only the appended trailing `free` response remains held. Consequently this
case proves browser/app seek completion and generation fencing, not a new Range
request per target or cancellation of pending seek-specific transport. Those
network claims require a larger faststart fixture whose target samples are not
already cached. Real Drive behavior and physical-device playback remain open.

`seek-range-h264-aac.mp4` supplies that larger transport discriminator. It is a
60-second, 5,223,316-byte, non-fragmented faststart H.264 Constrained
Baseline/AAC fixture with a one-second GOP. Its exact bytes, SHA-256 and
top-level box layout are pinned by `tests/static.test.js`. The 30-second target
starts at byte 2,631,163 and its next GOP starts at 2,722,529; the 54-second
target starts at byte 4,705,854 and its next GOP starts at 4,795,163.

In a fresh Chrome context, paused metadata preload first reaches a quiet,
fully completed contiguous boundary before either target. The observed run used
five requests through byte 327,679. Merely arming phase A for another 500 ms,
without changing native `currentTime`, must create no request and no seek
generation. Only the real 30-second `setPlayerCurrentTime()` may then open a
non-contiguous Range beyond that sequential boundary which overlaps the A GOP;
the observed request was `bytes=2621440-`, and the fixture withheld it after 64
bytes. Removing the native seek while resuming playback produces only the next
sequential request and fails this non-contiguous discriminator.

A real 54-second seek then supersedes the app generation. In the observed
Chrome run the browser did not cancel the pending A response during a 250 ms
grace period. The audit therefore releases A late, after B owns the app
generation, and Chrome requests a second non-contiguous Range (`bytes=4685824-`)
covering B's GOP. Only B may emit `seeked` and a decoded target frame at 54
seconds. A's correlated worker body completion must occur after B's `seeking`
stage and may not mutate the final time or emit any stale terminal/fallback app
stage. The alternate accepted branch requires an observed browser/SW
cancellation or abort before the same late-release no-op check.

This proves that an uncached, pending original Range from a superseded seek
cannot reclaim the app's final seek state. It also records that this Chrome
choreography did not cancel A; the app does not directly own native `<video>`
Range requests. It does not prove app-owned seek transport cancellation, real
Drive/CORS behavior, physical audible output, or a physical device.

The seek-range seed was generated with FFmpeg 9.0.1:

```powershell
ffmpeg.exe -hide_banner -nostdin -n `
  -f lavfi -i "testsrc2=size=640x360:rate=30:duration=60" `
  -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=60" `
  -map 0:v:0 -map 1:a:0 `
  -c:v libx264 -profile:v baseline -level:v 3.1 -pix_fmt yuv420p `
  -g 30 -keyint_min 30 -sc_threshold 0 -crf 26 -threads 1 `
  -c:a aac -b:a 48k -shortest -map_metadata -1 `
  -movflags +faststart `
  qa/seek-range-h264-aac.mp4
```

The faststart seed was generated with FFmpeg 9.0.1:

```powershell
ffmpeg.exe -hide_banner -nostdin -n `
  -f lavfi -i "testsrc2=size=320x180:rate=15:duration=10" `
  -f lavfi -i "sine=frequency=660:sample_rate=48000:duration=10" `
  -map 0:v:0 -map 1:a:0 `
  -c:v libx264 -profile:v baseline -level:v 3.0 -pix_fmt yuv420p `
  -g 15 -keyint_min 15 -sc_threshold 0 -crf 32 -threads 1 `
  -c:a aac -b:a 48k -shortest -map_metadata -1 `
  -movflags +faststart `
  qa/faststart-h264-aac.mp4
```

The seed was generated with FFmpeg 9.0.1 without `faststart`:

```powershell
ffmpeg.exe -hide_banner -nostdin -n `
  -f lavfi -i "testsrc2=size=320x180:rate=15:duration=3" `
  -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=3" `
  -map 0:v:0 -map 1:a:0 `
  -c:v libx264 -profile:v baseline -level:v 3.0 -pix_fmt yuv420p `
  -g 15 -keyint_min 15 -sc_threshold 0 -crf 32 -threads 1 `
  -c:a aac -b:a 48k -shortest -map_metadata -1 `
  qa/tail-index-h264-aac.mp4
```

Do not add `+faststart`: that would move `moov` ahead of media data and invalidate
the tail-index contract. FFmpeg is a one-time asset-generation tool, not a QA
runtime dependency.

`acceptance-audit.cjs` starts two isolated browser contexts with separate storage and synthetic OAuth sessions against one intercepted Drive store. It uses real application timers and UI actions, not manual sync calls, to verify continuous-foreground convergence, visible favorite removal, offline replay and reload persistence. Output is written to `qa/acceptance-browser/` (or the directory name passed as the first argument). `ACCEPTANCE_ROOT` may point to another checkout to reproduce the failure against `70ff332`; the unchanged baseline is expected to exit nonzero at the foreground convergence assertion. This does not certify actual Google propagation or two physical devices.

The physical-device procedure and remaining open gates are in `memory/ACCEPTANCE-20260917.md`.

### V2 mutation result ownership

`node --test --test-concurrency=1 tests/mutations.test.js` exercises the actual application controller with a synthetic authenticated Drive/ledger/lock store: response loss, independent GET, 403/429, 404, operation-ID conflicts, changed account, partial batch, storage failure, cross-tab serialization, root aliases, shortcut IDs, retry and immutable first-confirmed evidence. It does not prove live Google behavior.

`node qa/functional-audit.cjs v2-mutations-final qa/v2-ui-integration/fixture.webm mutations-only` runs the focused browser slice with actual localStorage/Web Locks and intercepted synthetic Drive only. Omit `mutations-only` for the complete suite. The optional seed is a bounded existing synthetic fixture, not a user video. Browser results: `qa/v2-mutations-integration/results.json` (22/22), `qa/v2-mutations-final/results.json` (3/3 after defensive fixes). No real Drive write or physical-device result is implied.
