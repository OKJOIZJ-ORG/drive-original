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
