# Stable Android native track unit — rc35

Preparation only. Runtime source is immutable `2c2b1244bee0f1a5e500318c83c6e126c5124e34`, `1.22.0-rc.35`; the root's four-receipt publication proof is required. Previous frame/retirement failures and the raw idle count failure remain unchanged.

`android-runner-stable-v6.cjs` creates one owned localhost tab using the maintained MCP, then closes that client and uses its owned CDP connection. It reuses the passed native-popup input receipt; every actual option still requires a unique enabled Chrome native popup node and an ADB tap. It does not use `selectOption`, product player calls, narrower viewport, real-account credentials or real Drive requests.

Before synthetic credentials, Range admission or media timing, normal startup is observed for 45 seconds. The stable gate requires the committed `SHELL_FILES` path set and every cached body hash (50 request keys: 49 distinct assets plus the root/index alias), activated current registration, no pending installing/waiting worker, observed normal automatic update invocation, at least 5 seconds of quiescence, and CDP Debugger hashes of executing `sw.js` and imported `media/revision-pin.js` plus exact worker VERSION. The update Promise itself is not exposed, so its completion is explicitly NOT_EXPOSED. No update is forced or suppressed.

The lifetime observer is installed before synthetic prestate and remains active until cleanup (240-second observer ceiling; native media queue independently bounded to 180 seconds). Every sampled/native-input gate rejects controller replacement or executing-source mismatch. Replacement evidence is saved before normal Back cleanup; new unavailable executable evidence remains UNKNOWN. Initial and final worker source hashes, lifecycle aliases and literal VERSION are retained without target URLs/IDs. Provider interception is limited to the owned tab and exact owned localhost SW, capped at 256 requests/24 MiB, and rejects every unrelated external request.

The native queue is startup → pause → tablet More/Tracks → AAC track 3 → paused seeks 2/5.5/2 seconds → tx3g track 4 automatic cue/clock checks → Off → normal Back and settled owner retirement. First 15-second seek failure remains in the receipt if a bounded continuation is necessary. Audio fidelity, Q2, phone `#shortsTracksBtn`, human finger interaction, iOS and real-account media coverage are not claimed.

Cleanup always attempts player retirement, both observers/listeners, owned registration/cache/storage, provider/CDP/MCP/tab, only owned ADB forward/reverse and localhost server. External cleanup and player retirement are separate predicates. All original candidate tabs must retain their exact URLs.

Root review/GO precedes this one execution:

```powershell
node qa/player-track-selection/android-runner-stable-v6.cjs --run 2c2b1244bee0f1a5e500318c83c6e126c5124e34 android-publication-proof.json android-actual-stable-tablet-tracks-result.json
```

Local checks: `node --test qa/player-track-selection/android-stable-runner.test.cjs qa/player-track-selection/android-stable-idle-gate.test.cjs` (12/12), plus syntax checks for the new runner, admission helper and observer. Preparation manifest verifies the exact new/frozen dependency bytes before any device action.
