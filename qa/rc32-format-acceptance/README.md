# rc32 finite format acceptance preparation

This leaf binds only committed source
`1d79897fd32c569137cab079bfd93107be2ee33f` / `1.22.0-rc.32`.
It preserves frozen rc31 deeper/parser/selector/reader/facade/source-proof and
image-observer logic through exact literal replacements. `inputs.json` pins all
26 safe producer/template inputs; build verifies every pin. `provenance.json`
binds three public source hashes, five committed player/module hashes and four
generated expressions. Public source/module hashes require independent served
byte qualification by root; storing them does not prove actual delivery.
No product, old QA, account, browser, device, provider, original, volume,
permission or Git state was changed. No private or actual result is a build input.

## Local reproduction

```text
node qa/rc32-format-acceptance/build.mjs 1d79897fd32c569137cab079bfd93107be2ee33f
node qa/rc32-format-acceptance/verify.mjs
node qa/rc32-format-acceptance/verify.mjs --check
```

The builder rejects aliases, abbreviated SHAs, non-commits and a version other
than rc32. Runtime bindings contain the literal full SHA and literal public
hashes; there is no runtime alias or mutable HEAD lookup. Verification uses only
offline synthetic account/response mocks and public Git bytes. It checks drift
refusal without editing original inputs, source denial before account reads,
four-key context retention and the four-static-GET proof/controller fence.
`freeze.json` and `curated-savepoint.json` cover only this safe leaf.

## Root execution, after actual rc32 delivery

Close/remove previous corpus owners and wait for their settled owned release.
Qualify actual served rc32 app/HTML/SW/cache/module bytes and current activated
controller independently. Use the already signed-in normal app, visible idle
playback, settled retirement and idle writer. No playback, state writer, other
account reader or update owner may overlap a probe. Never print the context,
tokens, file identities, names, resource keys or private input.

Evaluate `deeper.expression.js` into `window.__rc32DeeperEntry` and
`sw-proof.expression.js` into `window.__rc32DeeperSwProof`. This proof makes four
bounded static GETs, no Drive requests. Wait for `.poll().done` and
`.poll().accepted === true`. Privately set `window.__rc32DeeperPriorityName` to the
user's exact supplied priority name, then evaluate `derive-context.expression.js`.
It performs at most two metadata GETs and retains only the opaque four-key JSON
context in `window.__rc32DeeperContext`. Prior31 proof/context is invalid.

The smallest next structural unit is current cohort2, not a new full play loop:

```js
window.__rc32DeeperJob = window.__rc32DeeperEntry(
  window.__rc32DeeperContext, window.__rc32DeeperSwProof,
  {cohort: 2, mode: 'probe'}
);
window.__rc32DeeperJob.poll();
```

One explicit call re-enumerates the complete current scoped catalog twice before
selection and twice after. The selector retains the priority, all metadata-rare
MKV/AVI/BMP, all >=4GiB files and metadata risk categories. Cohorts limit each
job to5 ISO /1 EBML /2 other and8 total. Review the current `summary.plan`,
`stratumCoverage.references`, `stratumCoverage.cohorts`, inventory/probe
denominators and every result. Historical cohort2 was AVI/JPEG/MKV, but that
mapping is not imported. If an inventory-only discriminator is needed, explicitly
use `{cohort:2,mode:'metadata-only'}`; it gives no body/track proof and the next
probe performs fresh full inventories. There is no timer or automatic retry.

Limits stay64 media GETs/2MiB+8192/50s per file,1MiB per GET,10s headers/no-progress,
512 metadata GETs/64MiB/600s per job, observed first-inventory envelope +25%/margins
reserved for final inventory, and <=16KiB coalesced moov cache. No full-moov,
mdat-payload or whole-file QA GET. Timeout/budget omission remains deferred.
Successful scheduled attempts plus final catalog equality are not whole-corpus
codec or playback acceptance. Strong content/version/checksum/size and fresh
owner fences remain unchanged; wrong magic/MIME never manufactures track data.

Save only the safe summary. After `done`/`released`, a retained entry has a fresh
private reference registry for normal UI target/navigation qualification:

```js
await window.__rc32DeeperEntry.navigationTarget('representative-N');
await window.__rc32DeeperEntry.target('representative-N');
```

Use an exact current ordinal from the safe selected references. A ready result
has safe screen coordinates, freshly verified private metadata, and requires a
trusted ordinary UI click. It never opens media or injects app state. Follow only
known ancestor folder cards/breadcrumbs, <=8 fresh navigation reads; targets
<=38 fresh reads/32KiB/10s each. `AT_SAMPLE_PARENT` means ask for the file target.
If the target is outside the virtual viewport, root may perform ordinary scroll
and re-request the exact target; `NOT_RENDERED` is not evidence of file absence.
After a normal UI action/settled close or idle natural renewal, explicitly call
`rearmTargets(currentProof)` and require ready before another target. This
requalifies the retained catalog/account/drive/writer/idle owner; active probe
renewal cancels and never silently rebinds. Unsupported names/navigation/input
remain an explicit tool boundary, not a synthetic fallback or acceptance pass.

## Actual format/audio cues and honest dispositions

Keep each current representative's metadata classification, actual magic,
structural tracks, decoder capability, first frame, audio, seeks and sustained
playback as separate fields. ISO outputs can expose codec/config, channels,
sample rate and structural matrices; EBML can expose video/audio/subtitle type,
codec, dimensions/channels/bitDepth and color/default-duration presence. Presence
flags are not HDR/VFR qualification, and no packet/codec-private/timing oracle is
exported. TS signatures retain `TS_DEFERRED_NO_CONTINUATION` with tracks null.
AVI extension alone cannot establish AVI codec. A non-parsed track cannot establish
silence, missing subtitles, wrong MIME, rotation or corruption.

Prioritize discovered incompatible-audio/multi-audio/silent/subtitle/rotation,
large MP4/MOV, rare MKV/AVI/BMP, actual mismatch and GIF/animated WebP. Unknown
HDR/VFR/high-bit-depth remain unknown; absent is valid only for a qualified
bounded structural query or separately complete relevant enumeration. Structural
absence of audio is not audible silence proof. Do not erase unattempted/failed
denominators or import old safe JSON as a private completed registry. The rc31
prefix runner is source31-only; any later full feasible prefix continuation on32
needs a separately reviewed exact32 rebind and a fresh registry, not old capsules.
CORPUS06 still requires feasible whole-video bounded probe/image classification
and explicit omissions; it does not require full-playing every eligible video.

Normal actual opens must retain the exact source/account/file/version/content
fences. Record safe route fields `state.mediaPlaybackMode`,
`state.mediaTransportVerified`, `state.mediaAttempt`, `q1Playback?.kind`,
`q1Playback?.audioTransformed`, bounded status `q1Playback?.player.stats()?.status`
(`level`, `bitPerfectAudio`), badge `dataset.quality`, loader/error booleans and
selected equality booleans. Never dump player stats: they may contain private
source metadata. For frame proof record actual requestVideoFrameCallback
presentation increments/mediaTime, dimensions and finite before/after source
clock; currentTime or decodedFrameCount alone is not painted-frame evidence.
Actual10/50/90% normal UI seeks, paused seek settlement and finite sustained
progress remain separate from a first frame. Close normally and require settled
retirement/cleared selection and sources. Do not use stats polling to manufacture
an audio or frame oracle, and do not promote one representative to a whole row.

Q0 is validated original native transport; Q1 is original video/audio streamcopy
with compatible container remux. Q2 needs actual incompatible-audio evidence,
the `original-video-audio-compatible` route/`audio-transformed` badge, general status Q2 /
bitPerfectAudio false and preserved original video evidence. Actual sound needs
an existing authorized output observer/device observation or independent private
PCM oracle; advancing an audio clock is not audibility. Do not change volume or
permissions. Multiple tracks/subtitles need genuine selection/output/timing
evidence beyond counting tracks. Q3 remains conditional and unimplemented in
this product binding: a locally successful QA MPEG4 conversion is not an actual
product Q3 pass. Actual unsupported video/resource/tool boundary stays unresolved
with the precise failure, not corrupt-confirmed or conditional-N/A by convenience.

## Actual image opens

Evaluate `image-observer.function.js` and call
`installRc32ImageObservation(privateInput)` with root's protected fresh
`{account:{accountId,authAccountKey},target}`. The existing image function expects
root's current proof under `window.__resumeSwProof`; it must be the same exact32
qualified proof, not a prior proof. Private input stays local. The new observer
key is `window.__rc32ImageObservation`. Use normal UI only, at most five exact
representatives: GIF, animated WebP, PNG, large JPEG, rare BMP. Ordinary PNG does
not prove large-PNG; static WebP does not prove animated WebP. Actual wrong-MIME
requires a discovered/freshly qualified representative.

Reuse the pinned host `qa/rc31-actual-image-observation/painted-sampler.cjs`; no
sampler change. Before open call `.fence('card')`; after decode call `.arm()` and
`.fence('viewer')`. Root supplies the supported Page.captureScreenshot crop
adapter: only1x1 inverse-DPR crop, <=12 captures/8MiB per representative across
card/viewer/reopen, <=8s per temporal window. Do not save images, forward private
input into CDP or use the Android full-screen-saving helper. Unsupported Android
crop capture remains a separate device evidence limit. Stationary sampled pixels
are inconclusive for animation; changing hashes prove only sampled visible change.
Snapshot booleans include originalMode, transportVerified, imageReady/dimensions,
noImageIframeFallback, sameOwner and retired/cleared close. Native original
payload structure may preserve alpha/delay/loop; screenshots do not prove exact
alpha/frame delay/whole-loop preservation. Root must supply a qualified private
encoded oracle if claiming those clauses. Normal close/reopen the same file,
re-arm only for the new explicit lifetime, then normal close/dispose.

Cancel active deeper work with `.cancel()` and wait for `.poll().done` plus
`summary.released`. Call entry `.cleanup()` and proof `.clear()`, delete owned
context/job/entry/proof globals, dispose image observer, remove owned host handles.
An active cleanup request is not an awaited-release claim. Never clear browser
cookies/caches, log private bindings, modify original media or broaden budgets.
