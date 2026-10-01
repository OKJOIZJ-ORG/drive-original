## Remaining 50%/90% audio clauses (preparation and scoped actual evidence)

Observed 2026-10-02 03:23KST: actual PC attempt5 completed both remaining
fractions on the same designated original TS/revision and exact rc32 source.
Startup was12.611s; current-generation target qualification was11.603/11.201s
at50/90%. Each phase produced3 nonzero PCM windows,9/8 progressing native video
frames and advancing native/WebAudio clocks (maximum elapsed-clock difference
0.028270/0.053226s). Normal trusted play clicks admitted capture5.308/5.640s
after seek completion; separate fresh before/after metadata brackets qualified.
Both saved live receipts qualified and all six sampler cleanup flags passed.
[Attempt5 safe receipt](actual-pc-rc32-audio-seek-remaining-attempt5-safe.json)
is33,253B, SHA256
`d192df2d15c1fd500d769b2263af47624983fa7f60be3bc378ef870b928dc208`.
Final retirement/player close/root/query/search-input/private/proof/helper
restoration passed. The initial false query cleanup remains in that receipt:
MCP empty fill cleared the DOM value without the app input event; ordinary
fill plus Ctrl+A/Backspace restored the actual query. Preparation read errors
also remain; no additional seek or replay was used to resolve them.

Retain failed preparation attempts
[1](actual-pc-rc32-audio-seek-remaining-attempt1-safe.json),
[2](actual-pc-rc32-audio-seek-remaining-attempt2-safe.json),
[3](actual-pc-rc32-audio-seek-remaining-attempt3-safe.json),
[4](actual-pc-rc32-audio-seek-remaining-attempt4-safe.json) and the separate
[attempt1 cleanup recovery](actual-pc-rc32-audio-seek-remaining-attempt1-cleanup-safe.json).
Attempt1's incomplete output/false cleanup is preserved; attempts2/3 lacked the
normal play UID, and attempt4 lacked required marker UIDs despite valid physical
geometry. These are failed preparations, not additional qualified seek/PCM runs.
The pass reuses actual10% PCM and other valid TS evidence; physical speaker,
human audibility, exact sample/full soundtrack fidelity and whole-goal acceptance
remain unknown. The curation schema/string scan found no protected fields or
token patterns; it did not read private values to compare against them.

`audio-seek-remaining.expression.js` is an additive observer; it never runs
Chrome, ADB, Drive, metadata requests or native controls itself. The original
`audio-seek-supplement.expression.js` remains SHA256
`41305a9e20b7329cb9f46055e3b0d256848373f19211655c7fd0f15a1bd42967`.
Reuse the existing actual 10% PCM evidence. This producer covers **one** of the
remaining fractions per installation, on the same designated original TS and
the exact existing rc32/source-proof binding. Local fixtures are not actual
PC/Android acceptance. Run its focused guards with:

```powershell
node --test qa/rc32-ts-device-replay/audio-seek-remaining.test.cjs
```

For each fraction, root owns the following serial native-input procedure:

1. Preserve/export any previous safe receipt, stop the prior owned
   `__rc32TsReplay`/audio observers, then delete only their owned window handles.
   Leave the exact protected `__resumeReplayTarget30`, account, source proof and
   current native TS player in place. The holder must contain at least one
   `version`/`headRevisionId` and one `sha256Checksum`/`md5Checksum`, as well as
   exact stable metadata; never substitute a fresh different file/version.
2. Pause and reveal the normal slider through native controls. Install a fresh
   unchanged `observer.expression.js`, call
   `await __rc32TsReplay.metadata('before')`, verify all metadata guards, and
   immediately evaluate the new expression. Its before row must be within60s,
   from that same metadata observer; stale rows and duplicate labels fail.
   The existing metadata API permits each label once, so create a fresh observer
   pair for90% after exporting/stopping50%; do not relabel old receipts or
   replace its `metadata()` with hand-authored booleans.
3. Call `__rc32AudioSeekRemaining.armSeek50()` or `.armSeek90()` (equivalently
   `.armSeek(.5)`/`.armSeek(.9)`). Perform exactly one native pointer tap/swipe
   on `el.seekBarContainer` at the requested fraction; precheck physical pixel
   quantization against the returned target/tolerance. Synthetic DOM events,
   player function calls, setters and keyboard-only seek do not qualify this
   pointer observer. Poll `.read().seek` for at most45s: the trusted pointer,
   mapped target frame, exactly one seek/source retirement, fresh pipeline
   generation and actual late native settlement/readiness must all qualify.
4. Resume normally with a native play control. Within10s of the qualified seek
   and while that real input's `navigator.userActivation.isActive` is true,
   call `await __rc32AudioSeekRemaining.startAudio()`. Do not manufacture CDP
   `userGesture`, programmatic click or synthetic activation. If the activation
   has expired, preserve the failed attempt; a fresh deliberate native input
   and additive attempt may be used. The observer requires the unchanged seek
   owner, selected content, account, controller, source/generation, time mapping,
   ready settled pipeline, unmuted positive-volume native playback at rate1.
5. Poll `.read()` within the8s audio bound. Passing requires at least3 nonzero
   per-channel PCM windows, advancing WebAudio and native media clocks,
   at least2 progressing native video frames, native-frame alignment within.75s
   and native/WebAudio elapsed-clock agreement within.75s. Missing track,
   silence, no video progression, extra seek or owner/clock drift cannot pass.
   It uses `captureStream()` into per-channel analysers without connecting to
   the speaker destination or creating a media-element audio source.
6. After output completion, call `await __rc32TsReplay.metadata('after')` before
   closing the player. Call `await __rc32AudioSeekRemaining.stop()`, then export
   a **fresh** `.read()` (the earlier `stop()` return can predate after metadata).
   Require `qualified === true` and every cleanup flag true. Export only these
   reduced safe receipts to a new never-overwritten50/90% attempt filename,
   including failures. No raw PCM/media, token, account/file ID or private holder
   is exported. The audio observer auto-stops after success/failure; stop is
   idempotent and removes tracks/nodes/context, RVFC, timers and pointer listener.
   Stop the metadata observer, delete only these owned handles, and proceed to
   the next fraction with another fresh bracket. After the last safe export,
   close/await normal player retirement and restore/remove only root-owned
   temporary proof/private references.

The total installed observer bound is90s; context close has a separate1s bound.
Preserve failure receipts before cleanup/deletion and report any false cleanup
flag. Capture support, fresh native activation and the physical input tolerance
remain actual-runtime prerequisites. Rendered PCM with aligned advancing clocks
supports the remaining QA-TR-03 audio clause; physical speaker audibility, exact
sample fidelity, full soundtrack correctness and another device remain UNKNOWN.
Capture-stream content is not itself proof of physical speaker output (see
[W3C media-element capture](https://www.w3.org/TR/mediacapture-fromelement/));
the native mute/volume guards describe the original element's observed controls.

`android-audio-seek-remaining.cjs` prepares the validated common transport,
source/private holder, normal library input and safe exports before timing;
then runs `.5`, `.9`, or `both` serially with a fresh metadata pair per phase.
Root-only actual invocation (a new safe filename is mandatory):
`node qa/rc32-ts-device-replay/android-audio-seek-remaining.cjs <protected-json-path> actual-android-rc32-audio-seek-remaining-attempt1-safe.json both`.
Its helper SHA freezes reject drift; exclusive creation refuses old receipts.
Work/total bounds are240/300s for both,180/240s for one, plus separate180s prep;
in-flight common CDP commands can take45s. Saved `liveReceipts` qualify before
normal Back; final sampler/player/private/proof and common transport cleanup are
reported separately. Guard tests: `node --test qa/rc32-ts-device-replay/android-audio-seek-remaining.test.cjs`.

### PC normal-input support

Install `pc-seek-targets.expression.js` only while the current TS owner is normally
paused with visible controls. It adds exact50/90 hit markers to the unchanged bar
and temporarily changes its AX role to `group`. Require `read().fences.axRoleCurrent`,
the selected marker's available/exact-hit geometry, and its UID in a fresh official
MCP snapshot before arming the observer and clicking natively. This is AX targeting
instrumentation, not product accessibility proof. An isolated local Chrome page
exposed markers under both slider and group; role-only causality for the historical
MCP omission is unproven. Stop/error/180s deadline restores the exact previous role
(including absence); require sticky `roleRestored` and `roleIntegrity` cleanup flags.

Install `pc-audio-native-click.expression.js`, then call
`__rc32PcAudioKick.arm(.5)` or `.arm(.9)` after the matching qualified seek. A real
trusted click on the existing normal play control lets the app resume first, then
starts the unchanged audio observer within the existing activation/owner bounds.
Only poll `read()` afterward. Never evaluate `startAudio()` through MCP: its bundled
evaluation uses `userGesture:true`. Stop the kick/markers/metadata handles after
each exported live result, then close and await normal Q1 retirement. Preserve
failures before removing owned handles. `pc-safe-wire.cjs` parses result presence
without losing false/empty replies; `pc-snapshot-uids.cjs` reduces the private native
snapshot to fixed control handles. UIDs and raw snapshots stay private.

Reused focused proofs: marker7/7, native-click4/4, wire4/4 and UID3/3. This curation
parsed all six safe attempt/cleanup receipts, verified the pass and its three
producer SHA pins, fresh time brackets/activation/cleanup, and scanned safe outputs;
it reran no product or browser/device acceptance tests. The inactive failed
`pc-native-admitted-client.cjs` direct-CDP helper stays in ignored recovery scope.
