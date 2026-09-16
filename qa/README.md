# Browser QA

Runtime dependencies: none. These are development-only fixtures.

```sh
npm --prefix qa install
npx --prefix qa playwright install chromium webkit
node qa/browser-audit.cjs chrome-final
node qa/browser-audit.cjs webkit-final webkit
node qa/functional-audit.cjs functional-final
node qa/edge-audit.cjs
```

Chrome must be installed for the Chrome-channel runs. All OAuth and Drive responses used by functional tests are intercepted fixtures. No real media is moved or deleted. WebKit on Windows is not physical iPhone Safari proof. Reports and screenshots stay local under qa/ and are excluded from the Pages artifact.
