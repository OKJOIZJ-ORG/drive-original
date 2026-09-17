# Browser QA

Runtime dependencies: none. These are development-only fixtures.

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
