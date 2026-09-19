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

`acceptance-audit.cjs` starts two isolated browser contexts with separate storage and synthetic OAuth sessions against one intercepted Drive store. It uses real application timers and UI actions, not manual sync calls, to verify continuous-foreground convergence, visible favorite removal, offline replay and reload persistence. Output is written to `qa/acceptance-browser/` (or the directory name passed as the first argument). `ACCEPTANCE_ROOT` may point to another checkout to reproduce the failure against `70ff332`; the unchanged baseline is expected to exit nonzero at the foreground convergence assertion. This does not certify actual Google propagation or two physical devices.

The physical-device procedure and remaining open gates are in `memory/ACCEPTANCE-20260917.md`.
