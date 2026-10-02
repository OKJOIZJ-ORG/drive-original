# v9 known normal browser condition — preparation only

Fixed source35 `2c2b1244bee0f1a5e500318c83c6e126c5124e34`, original fixture and prior receipts remain unchanged. After MCP closes and the provider attaches, but before any localhost navigation, `android-phase-snapshot.cjs` requires exactly one fresh owned `about:blank` target and sends `ServiceWorker.setForceUpdateOnPageLoad({forceUpdateOnPageLoad:false})`. Successful setter ACK is recorded. Unsupported protocol stops before media without fallback. There is no getter/readback claim, force=true, app-update suppression or registration wrapper; legitimate automatic updates remain enabled. This condition does not prove what caused v7.

The45-second normal idle gate still checks exact executing `sw.js`/`revision-pin.js` bytes/VERSION,50 shell keys and settled activated registration. Then the native full queue runs with the180-second ceiling: startup/pause → AAC3 → paused seeks2/5.5/2 → automatic tx3g4 cues and Off → normal Back/retirement. Passed popup path and v8 passive visibility/update-generation/public-request reduction are reused.

Provider/owned-server rows now carry host epoch timestamps alongside their monotonic clocks. Read-only device/Node clock observations bound the offset; no clock changes occur. Before-close failure/final snapshots `structuredClone` only already-reduced arrays immediately, with capture epoch, so later cleanup cannot mutate phase evidence. Full final provider/wire aggregates are explicitly separate lifetime evidence.

Full-queue request capacity is fixed1024,24MiB,15-second RPC. Actualv8 startup/AAC consumed254 requests (101 local,51 metadata,24 Range,76 OPTIONS,1 download,1 unrelated denied). Budget planning is254 +3×192 rebuild envelopes +128 caption reserve +66 local/update/cleanup headroom =1024. Each192 envelope allows32 logical reads×6 metadata/Range/preflight events, above the observed24 Range baseline. It is conservative planning capacity, not a proven maximum; exceeding1024 still fails with no automatic increase/retry. Same-fixture local combined result123 GET/POST calls omits OPTIONS/local and uses a different UI order, so it does not prove512 sufficient.

Local7 checks cover acknowledged-false target/order, unsupported/unowned refusal, nested snapshot immutability, bounded clock observations, retained full queue/no suppression, cap/epoch-only provider diff, and actual fulfillment1024/1025 boundary/no retry. Syntax3 and exact dependency freeze verification pass; prior transport24MiB tests are reused through byte-identical transport logic.

Root review/GO precedes one execution:

```powershell
node qa/player-track-selection/android-runner-normal-v9.cjs --run 2c2b1244bee0f1a5e500318c83c6e126c5124e34 android-publication-proof.json android-normal-full-v9-result.json
```

No actual browser/device/private input/network work occurred during preparation. Source/current-owner/controller/account/target fences, failure-before-close source capture and all cleanup remain. Earlier failures and UNKNOWN causal trigger stay preserved; no phone/human finger/original/audio fidelity/iOS coverage is added.
