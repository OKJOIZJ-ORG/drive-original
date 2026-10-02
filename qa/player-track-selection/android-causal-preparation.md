# Causal Android discriminator — preparation only

The fixed rc35 source, existing v7 failure and native input proof are preserved. New runner `android-runner-causal-v8.cjs` keeps the passed45-second idle/executing-source/cache gate,512 requests/24MiB, exact owned origin/fixture and all cleanup. Media is reduced to startup → pause → native tablet track dialog/AAC3, bounded30 seconds. No seek/caption queue, extra original media requests, product wrappers, forced/suppressed update or changed serving bytes.

`android-observer-causal-v5.function.js` adds passive visibility events (cap32), initial/current `updateCheckGeneration` and baseline delta. These are recorded alongside existing controller, installation and native-popup step timestamps. The new provider observes page and strictly owned-worker `Network.requestWillBeSent` only for `/version.json`, `/sw.js`, `/media/revision-pin.js`. It immediately discards full request objects/queries/headers and stores public path, fixed initiator type, whitelisted public function/line, numeric clocks and private-worker numeric alias (cap128). No body read or new request is introduced. The local server hashes its existing exact public response buffers and records method/status/representation hash/size (cap128); HEAD body size is0 while its representation hash remains explicit.

Visibility-visible → incremented generation → `checkForAppUpdate`-initiated version request preceding updatefound can support a normal application invocation. No such chain would leave browser/tool or an uncompleted prior update as alternatives. Initiators can be absent or UNKNOWN; missing events do not prove absence. Network/provider/page clocks are explicitly different domains. Same wire/executing bytes do not reveal Chrome's stored script graph or force-update runtime flag.

Scoped cached MCP1.10.1 inspection found `service-worker-update-on-reload` defaultfalse in `third_party/index.js:146856`, and conditional `invoke_setForceUpdateOnPageLoad` at147001–147003. No explicit force=true call was found by the scoped search. This is source inspection only; the actual browser setting/calls remain UNKNOWN. No setting is read or changed by this diagnostic.

Local5 behavioral checks: exact public reduction/privacy; GET/HEAD immutable wire receipts; visibility/generation and listener cleanup; page/owned-worker event reduction/detachment; only the30-second native phase/no force/wrappers. Syntax4 and exact preparation dependency verification pass. Root review/GO precedes one actual command:

```powershell
node qa/player-track-selection/android-runner-causal-v8.cjs --run 2c2b1244bee0f1a5e500318c83c6e126c5124e34 android-publication-proof.json android-causal-switch-result.json
```

Replacement is saved before native Back, including both executing worker hashes/VERSION and reduced causal observations. No automatic retry follows. External cleanup does not convert unsettled Q1 retirement into a pass.
