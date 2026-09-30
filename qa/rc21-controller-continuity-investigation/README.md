# Unit21 continuity investigation — environment-only stop

Human changed scope to environment preparation only and deferred task execution until a later explicit request. Product/native probes stopped immediately. This leaf preserves every executed new producer/raw pair. Old Unit21 v1-v6 producers and failures are untouched; app.js/sw.js and all product/version files are unchanged. Root owns handoff/integration/commit.

## Observed evidence, not a resolved cause

`diagnostic-results.json` reproduced the failed full chain on fixed current rc21 source. It adds both main/import intended response SHA, cross-document lifecycle journal and native CDP worker-version aliases. Four distinct workers were installed/activated. All sampled post-toggle main responses had one fixed hash; every sampled revision-pin import response was unchanged.

`stored-script-results.json` is a separate retained failed diagnostic. Native Debugger.getScriptSource confirms the actual compiled source: worker targets2/3/4 all contain main SHA `fcbe10b47122539c52db255bb2fbb6b71e9fb0e450c5453de80d76178002a55d` and revision-pin import SHA `6550cbed08542607cdf7720b17a18de7eeae01015296afdabb59d9b8f6169008`. Thus the sampled extra replacements are not explained by a different compiled main/comment/import body. Debugger attachment is diagnostic instrumentation, not qualification or production behavior proof.

`routing-control-results.json` compares the same exact app's one fixed update, same-byte explicit check and reload startup without media or auth injection. Routing enabled and routing disabled each had worker counts1→2→2→2. This disproves routing/cache-disable alone as a sufficient explanation under that control. It does not isolate active TS/provider interception from static response framing; it also does not prove end-to-end playback continuity. Both isolated controls blocked external network through launch DNS rules; the routed control additionally blocked external requests in its route. Both browsers and servers closed.

The installed Playwright implementation uses Network.setCacheDisabled(true) while interception is enabled. Its current [Service Workers documentation](https://playwright.dev/docs/service-workers) describes worker-owned request routing and the main-script update routing limitation. [Chrome's primary update description](https://developer.chrome.com/blog/fresher-sw) documents byte comparison for main and imported scripts. These sources guided the discriminators; they do not identify a product root cause. A current Chromium register-job source read also confirms a distinct skip-script-comparison flag exists; no evidence here establishes that this browser used it. Source findings remain provisional.

## Unexecuted transport discriminator and memory boundary

The failed full-chain server streams ordinary static files, whereas the no-media comparison serves fixed Buffers. `fixed-body.cjs` changes only this QA response-body delivery for the next discriminating experiment, preserving app/SW/provider/flow. It was never native-executed: the existing memory guard raised AssertionError before Chrome launch, leaving zero saved cases. The idle owned server was stopped through its own exec session. `fixed-body-prelaunch-note.json` explicitly records that the rejected memory values were not captured and the raw report is not a native failure.

`fixed-body-v2.cjs` moves the unchanged guard inside finally-covered setup. It also failed that guard before launching Chrome; its failed raw case and producer remain, and its server closed normally. No transfer/cache/account/pin/retirement budget was lowered. These two attempts provide no evidence for or against the response-framing hypothesis. No further probe should execute without the later explicit resume request.

## Environment needed tonight

Existing dependencies and observed isolated Chrome154.0.8037.58 are sufficient; no new dependency/install is needed. Keep the original launch floor: free physical memory >1048576KiB and free virtual memory >1572864KiB. The last preparation-only read was physical1595564KiB and virtual1153940KiB, so native launch is currently not ready. There is no child-owned native browser left to close. Other browsers/processes were not terminated or altered.

The current Chrome DevTools MCP list_pages attempt reported its managed-profile-in-use boundary. Root should establish the intended MCP-owned/isolated Chrome surface through supported recovery before tonight's browser work; no personal profile was selected or modified here. The maintained isolated native driver remains available. There are no personal-account, token, OAuth, original-media or production inputs in this unit.

On a later explicit resume, first verify source identity/environment, then execute a genuinely discriminating next step. The prepared transport control is one candidate; product changes still require a demonstrated responsible defect and coordination with root. Complete one-update/reload/reopen current-frame/settled-close qualification remains unresolved. Environment preparation is the only current authorized scope.

`environment-handoff.json` binds all five exact producer/raw/source pairs and shutdown/readiness facts. `curation.json` is the safe exact path/hash allowlist, including failed and prelaunch-only attempts. No old record was overwritten.
