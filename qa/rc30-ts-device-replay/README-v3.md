# Additive Android attempt 3

The executed attempt 2 and its producer remain frozen:
`android-same-file-replay-v2.cjs` SHA256
`69490c03abac1cd98439a0c517f3a16cb001f7be8162991c2e9f050c39ea42bb`.
Attempt 2 presented the same exact private TS file at 15.894s, retaining the 15s
startup failure, then stopped before seek arm at `NATIVE_TARGET_UNAVAILABLE`.
It did not record which target was unavailable. Its result is preserved, and its
MCP/CDP/forward/player retirement cleanup was qualified by the parent.

`android-same-file-replay-v3.cjs` is a separate producer. It preserves the source30,
private fresh metadata/account, folder path, observer v2, first-frame, 15s/35s seek,
EOF unknown, same-file reopen and normal cleanup contracts. The new output is
`android-same-file-replay-attempt3-result.json`. The child prepared and checked it
locally; actual execution belongs to a separate reviewed parent run.

The relevant source30 UI contract is that visible player chrome has z-index24,
above the bottom entry at z-index3. A normal mediaStage tap first dismisses visible
chrome without pausing; when chrome is idle a later tap toggles playback. This is
confirmed by the actual immutable `handleStageTap` in local checks. It is a code
contract, not a proven causal explanation of attempt2's unrecorded target failure.

Before any native target failure, v3 saves only a fixed safe key, numeric geometry,
viewport and style allowlist, hidden/inert ancestors, controls-idle, and fixed hit
booleans for video/entry/chrome/modal/interactive. No target text, file/account ID,
arbitrary DOM identity, error text or private snapshot is exported. Player probes
never scroll hidden controls into apparent accessibility. Entry probes sample at
most seven interior points and use only an actually unobscured point. Slider
probes test its requested fraction only; an occluded fraction cannot be replaced
by a different seek position. Stage probes exclude chrome and interactive controls.

Pause first uses an accessible ordinary transport button, then, if needed, at most
two normal mediaStage taps separated by650ms. It checks actual native paused state
after each. A stage tap's320ms delay and double-tap-to-favorite contract are tested
with the real source30 handler. A covered entry with unavailable seek receives one
normal surface dismissal, then a new unobscured entry probe and normal tap. The
seek slider point and physical rounding are freshly measured before input.

The reused actual path is
`qa/rc21-android-night/159-rc28-post66-natural-seek-close.cjs`, SHA256
`4aa5a4b3be2056205560083eb6a568d04987b61288c29a201a04aedb3d1e5f4c`.
That earlier physical tablet result does not itself prove this file or source30.

The passive observer remains frozen v2 SHA256
`3d5c4c5646f678ce410ed8605e0a327fef6776ebd2cc814b44745b92d297c9b1`.
The native folder helper remains SHA256
`81e82da0e87d32a847da90ffb927c715d537ffc9e79e31606314161f8b2a775a`.
The new UI helper is a function source, not an exported Node module:
`observeRc30NativeTarget(key, options)`. Evaluate it in the exact current app page.
It returns safe admission geometry and performs no input. Keys are card,
folderMoreButton, searchInput, ctrlPlayPause, mediaStage, playerControlsEntry,
seekBarContainer; `options.xFraction` is used for an exact slider point. Standard
app lexical `el`, `playerChrome` and private `__resumeReplayTarget30.target` or
`.metadata` provide context. Its card query is exact-ID scoped. Another owner may
reuse it read-only in a differently source-qualified tab; the helper itself does
not supply that owner's source/account proof or coordinate mapping.

Root-only execution after reviewing frozen hashes:

```text
node qa/rc30-ts-device-replay/android-same-file-replay-v3.cjs <PROTECTED_PRIVATE_JSON> android-same-file-replay-attempt3-result.json
```

No product files, prior results, private recovery files, device settings, cookies,
network state or originals were changed by this preparation. Native OS injected
input is not human-finger, phone, iOS or audio-fidelity evidence. Exact final frame
remains `UNKNOWN`. The six-minute bounded active replay and normal finally cleanup
remain separate from full natural renewal/endurance or broad corpus acceptance.
