# Local app integration, 2026-09-29

Owned product changes: `app.js`, narrow `media/general-player.mjs`; tests
`tests/general-app-routing.test.js` and the capability-aware fixture in
`tests/q0-proxy.test.js`. No commit, deployment, account access, volume change,
public allowlist, SW or license publication changes were made by this unit.

## Behavior

- Q0 assigns a native URL only after a correlated `Q0_CAPABILITY_RESPONSE` from
  the exact current controller. Old workers wait for replacement within one
  12-second deadline. Cancellation and file/session/account/source fences prevent
  stale continuation; readiness does not consume the media retry.
- Initial TS priority remains. After real code 4 plus verified original transport
  and a retained revision pin, ISO/QTFF can enter the bounded general Q1 worker.
  Network, credential, classified provider and unverified transport failures do
  not become codec fallback. Source retirement precedes a new source generation.
- Only Q1 `GENERAL_CODEC_UNQUALIFIED` admission can probe the Q2 worker. Its own
  explicit native-capability/profile gate still controls AC3/EAC3 stereo 48 kHz.
  Other failures are terminal. The app displays Q2 as original video with lossy
  compatible audio, rather than claiming bit-perfect audio.
- UI, pointer/keyboard/frame seeking, relative seek and snapshots use source
  time minus presentation origin. The general player forwards status/capability
  and preserves digit-bearing fixed AUDIO codes.
- The original source endpoint bounds UI/seek and pauses playback. This is a
  logical media-clock bound, not a sample-exact hardware audio cutoff. The app
  does not drop an entire boundary audio frame using appendWindowEnd.

## Evidence and counterevidence

`app-tests.txt`: 177/177 app, routing, Q0 proxy and SW capability checks.
`general-tests.txt`: standalone general Q1 8/8. The combined parallel run in
`current-tests.txt` had a general-test process failure after four passing cases
without an error payload; it is retained rather than represented as a pass.

`native.cjs` uses installed Chrome in an isolated ephemeral profile, the complete
local app and SW, synthetic provider responses, real DriveSource/MSE workers,
and original synthetic files. It does not use a real account. The existing MCP
Chrome profile was locked; no personal profile was touched. Native proof requires
actual player stats, decoded frames and confirmed drain, not an attempt label.

`native-results.json` records exact source hashes before and after a full run.
AAC Q1 decoded, sought, and cleaned up after account replacement; initial TS
decoded and cleaned up. AC3's controlled Q1-to-Q2 fallback failed once with
`GENERAL_PIPELINE_FAILED`, before a window/chunk, after one 65,536-byte source
read. Original-source and worker cleanup were settled. The driver exits nonzero.
This intermittent failure remains unresolved, even though another run succeeded.

`diagnose-q2.cjs` performs one bounded AC3 repeat, instrumenting only the served
worker's catch block to report the synthetic error name/message. Product files
are unchanged. `native-q2-diagnostic.json` passed decode, seek, end and drain;
no underlying error reproduced. Native time paused at 6.000844 seconds, source/UI
end was 6, and MSE duration was 6.018666. Its served worker is instrumented, so
this is diagnostic evidence, not an unchanged-product all-pass qualification.

`native-attempt-1.json` retains an initial harness/implementation failure: an
attempt label was present without a constructed player. `clearDirectMediaSources`
had advanced the source generation; synchronizing the newly selected owner fixed
it. `native-attempt-2.json` is the subsequent successful exploratory trial, before
the final before/after hash and endpoint assertions. Neither replaces the final
discriminating report.

AC3 native playback showed video frames without code 4 in this Chrome. Therefore
the AC3 derivative entry in these trials was controlled explicitly after Q0;
it does **not** prove automatic detection/recovery of unsupported silent audio.
The next planner unit must inspect actual pinned tracks and native input-audio
capability, while keeping the same source identity and owner/drain fence. The
entry currently is `tryOriginalTsPlayback(file, session, {general:true})`; Q2's
qualified worker boundary is `media/audio-general-worker.mjs`. Do not use a MIME
or filename guess, a network error, or merely video decode success as that gate.

## Root integration order and limits

Review app ownership/routing and current Q2 source validation first; retain the
intermittent app-worker failure. Sol's separate `qa/q0-upgrade-ordering` owns the
actual old-worker/new-app replay. Root owns final SW/asset/publication/version
changes and exact producer manifest refresh. Re-run only checks affected by those
changes, then perform candidate/device/account qualification. This unit does not
declare distribution ready, production proof, physical-device compatibility,
automatic silent-audio recovery, or sample-exact final audio output.

## 2026-09-30 pinned-track planner follow-up

The app now starts a bounded audio-track probe after its Q0 service worker binds
the exact revision. A fresh Q1 source identity must match that private pin; its
Range reads use the same Q0 pinned URL while Q0 owns the media session. An
actual ISO `ftyp` signature gates the container parser. A single AVC plus
AC3/EAC3 track with unsupported native AudioDecoder input and supported Opus
output selects Q2; AAC remains native. Other Q2 capability failures stop with
an error. The Q2 player opens a new revision-fenced source only after Q0 retires.

`native-auto-results.json` records 10/10 fresh-context automatic AC3 Q2 runs;
`native-eac3-auto-results.json` records 1/1 EAC3; and
`native-aac-preserve-results.json` records 1/1 native AAC. These isolated Chrome
runs used synthetic provider responses and real app/SW/player workers. Each
report includes exact fixture/producer SHA-256 hashes, stable start/end producer
maps, decoded video frames, source endpoint, and settled owner drain. They are
not real Drive/account or physical-device evidence.

`native-manual-cold-results.json` records 10/10 manual Q1-to-Q2 cold runs with
an instrumented served worker. Its `QA_Q2_ERROR Error GENERAL_CANCELLED`
console rows are expected cancellation during Q1 replacement/seek/close, not
terminal playback failures. The prior unchanged-product 1/4
`GENERAL_PIPELINE_FAILED` after one 65,536-byte read did not recur; cause and
repair remain unproven. These ten instrumented runs do not erase that failure.

After those native runs, the final ISO-signature skip and direct-media cleanup
on probe failure were added. Focused Node checks of actual fixtures, routing,
and Q2 end mapping pass 21/21; `node --check` passes for `app.js`,
`media/audio-general-pipeline.mjs` and `native-auto.cjs`. A final native smoke
of those last two edits remains open. A probe source whose abort reports
unsettled after its Q0 owner has already changed is not yet latched into the
global Q1 retirement barrier; this cancellation edge needs review before a
release claim. No production or real-account acceptance is claimed.

## 2026-09-30 probe retirement integration

Five baseline regressions in `retirement-before-tests.txt` reproduce early Q0
retirement while a stale probe abort is still pending (source generation,
account, account generation, and SW controller changes), and missing cleanup
failure retention for the current ISO probe. The pin-bind owner now retains the
actual planner promise as `setupDone`; retirement joins that promise before
claiming settled. Every directly owned abort result/rejection and an attached
parser cleanup failure sets `owner.cleanupOk=false` before stale-owner returns.
The existing global barrier keeps that uncertainty sticky through later owners.
Nine added planner tests also distinguish successful non-ISO cancellation,
rejected cancellation without an unhandled setup rejection, and a parser cleanup
failure that a second successful abort must not erase. These changes supersede
the open cancellation edge above. Dynamic imports alone are replaced in the VM
fixture; planner, pin binding, and retirement logic use the actual app source.

`retirement-final-tests.txt` records the current app/routing/audio-probe/Q2-end/
Q0-proxy/SW-capability suite. The earlier expanded run in
`retirement-after-tests.txt` retains 11 Q0 fixture failures: that fixture omitted
the mandatory video element and pin binding swallowed its TypeError as
`PIN_REJECTED`. Root repaired the fixture with a hidden video element rather than
changing the product DOM contract. `retirement-final-tests.txt` is the refreshed
run after that fixture repair.

`native-retirement-smoke.cjs` saves per-case results incrementally and launches
and fully closes a fresh installed Chrome for each case.
`native-retirement-smoke-results.json` passes all six cases: automatic AC3 and
EAC3 Q2 with seek/source-end/decoded-frame/drain assertions; native AAC; native
WebM through the actual `ftyp` exclusion; controlled manual Q1-to-Q2; and an
injected probe metadata drift that removes the direct media source and settles
retirement. App, SW, and media producer hashes are identical before/after.
The manual case suppresses the automatic planner only to isolate the fallback;
the drift case changes the main-thread synthetic metadata response only. The
served product app and workers remain unmodified. This closes the missing final
native smoke for the ISO exclusion and probe failure direct-source cleanup.

`native-auto-retirement-crash.json` preserves seven successful console summaries
followed by an eighth-case tab crash from an attempted ten-context repeat. Its
driver wrote no new full result report; those summaries are partial observations,
not a new 10/10 qualification. `retirement-host-before.json` and
`retirement-host-retry.json` show low host memory/commit headroom after that run,
but do not establish crash causality. The first new smoke harness incorrectly
waited for a nonexistent player `stats().window`; its retained failure is
`native-retirement-harness-window-failure.json`. The corrected harness checks the
actual `mapping` contract, and the subsequent six-case report passes. All owned
isolated browser processes were closed. The historical cold
`GENERAL_PIPELINE_FAILED` still has no confirmed cause or fix, and no real
Drive/account, physical-device, broad-format, volume-setting or production claim
is added.

## 2026-09-30 native Q0 budget counterexample

Independent integration review found that the optional Q2 probe can reject a
native AAC file before identifying its audio codec when its sample count exceeds
the general player's 65,536-sample index budget. The old planner treated
`GENERAL_EXPANDED_INDEX_LIMIT` as a terminal original-source failure. Native
Q0 availability must not inherit the narrower Q2 qualification budget.

The planner now continues Q0 only after confirmed source cleanup for seven
explicit optional-inspection budget codes: expanded index, table entries, box
count, discovery, packet size, metadata size, and input span. `GENERAL_BOX_COUNT`
is emitted only by the 4,096-box count guard. No prefix wildcard was introduced.
Malformed box/table data, body errors, read timeout/queue/cancellation, original
identity/permission, capability rejection and uncertain cleanup remain terminal.
The real audio-probe test mutates an existing AAC fixture's `stsz` counter to
65,537 and observes the real index-limit code with source cleanup. This is an
allocation discriminator, not a complete valid long-film/native decode fixture.

`retirement-budget-final-tests.txt` passes 211/211 app, routing, actual probe,
Q2 endpoint, Q0 proxy and SW capability tests, including seven clean budget
continuations, ten terminal contrasts and unsettled-cleanup refusal. The final
`native-retirement-budget-smoke-results.json` passes one fresh installed-Chrome
native AAC case with stable final producer hashes, decoded frames and settled
retirement after account replacement. The preceding six-case report retains its
pre-budget-fix hashes; budget changes affect only the exception classification,
so AC3/EAC3 capability selection, WebM signature exclusion and normal cleanup
paths retain those scoped observations. No new full 10-cycle qualification,
long native AAC film, real account or device proof is claimed.

## 2026-09-30 HTML file capability versus WebCodecs

`native-file-before-tests.txt` preserves two failing discriminators: HTML file
support with WebCodecs input rejection selected Q2 instead of Q0; WebCodecs input
support refused otherwise qualified Q2 output. The optional main-thread probe
now queries `HTMLMediaElement.canPlayType` with the actual parsed MP4/QTFF
container and combined AVC plus audio codec strings. Its `probably` response
preserves Q0; an empty response declares unsupported; `maybe`, missing or
rejecting APIs, and unqualified query configuration stay unknown and preserve
Q0 pending any original playback error. Native positive/unknown decisions do
not depend on Opus availability or the narrower stereo Q2 profile.

WebCodecs input support remains a nullable diagnostic field, not a native file
capability or an exclusion from WASM audio decoding. Q2 output eligibility still
requires the qualified stereo 48-kHz input, supported Opus encoder and supported
MediaSource audio output. The existing player's exact combined AVC/Opus MSE
gate remains authoritative before append. Missing/rejecting codec APIs yield
unknown/ineligible output instead of throwing a TypeError into valid Q0. Only
MediaSource qualifies the current general player; ManagedMediaSource alone does
not. No fabricated bitrate/framerate was supplied to MediaCapabilities.
The response policy follows the [HTML media type contract](https://html.spec.whatwg.org/multipage/media.html#dom-navigator-canplaytype-dev);
the [MediaCapabilities file configuration](https://www.w3.org/TR/media-capabilities/#dom-mediadecodingtype-file)
is a separate API whose mandatory metrics are not invented for this probe.

`native-file-integration-after-tests.txt` passes 247/247 relevant app, ownership,
source, probe, Q2-end and audio-lifecycle tests. `native-file-first-after-tests.txt`
retains the two old fixture expectations that had relied on missing HTML APIs
to establish unsupported playback; those fixtures now explicitly declare HTML
unsupported rather than relying on WebCodecs rejection alone.

`native-file-capabilities-smoke.cjs` reuses the maintained native app/SW harness,
changes only observation/case/report logic, and serves product bytes unchanged.
Its adapter and base hashes are recorded. The three-case report observes Chrome
153.0.8010.54 exact combined queries: AVC+AC3 and AVC+EAC3 return empty/unsupported,
WebCodecs input false and Opus/MSE true, so automatic Q2 decodes, seeks, reaches
the source endpoint and drains; AVC+AAC returns probably/native positive and
WebCodecs true, stays Q0, presents frames and drains after account replacement.
Each case has its original synthetic fixture hash and matching start/end
producer maps. These are declared capabilities plus synthetic route/playback
proof, not speaker, physical Safari, actual Drive/account or production proof.
The runtime's unnecessary ManagedMediaSource alias was removed after that
native run to match the current MediaSource-only player, followed by its focused
counterexample and the passing 247-case suite. That final alias removal does not
affect the observed Chrome MediaSource branch; the original native report hashes
are preserved rather than repinned retrospectively. Host snapshots bracket the
run without claiming they explain historical failures.

## 2026-09-30 pending capability cancellation

Independent review's bounded Node discriminator used the real AC3 probe with a
deliberately never-settling WebCodecs support query. After owner abort and 30 ms,
the original source was settled but probe setup remained pending; Q0 retirement
would still await that setup. This is a mocked API ownership counterexample,
not evidence that a real Chrome capability query hung.

Capability queries now receive the source owner's signal, reject pre-aborted
work, race pending decoder/encoder support queries against abort, remove abort
listeners at settlement and throw fixed `GENERAL_CANCELLED` on cancellation.
Cancellation is separate from a missing/rejected capability's unknown value;
it cannot start the subsequent output query. Both the main-thread probe and Q2
worker stream forward that signal. Existing RPC finally cleanup and sticky
owner uncertainty remain in place, with no broad timeout/native fallback.

`native-file-cancellation-after-tests.txt` passes 88/88 focused cases, including
pending diagnostic and Opus queries, pre-aborted source/no-query behavior,
late query rejection without an unhandled promise, abort-listener removal and
actual app planner plus real probe retirement/drain after each pending-query
cancellation. `native-file-integration-final-tests.txt` passes 254/254 relevant
integration checks. Syntax checks pass for both changed media modules.
The preserved three-case native report predates this cancellation forwarding
and the MediaSource alias removal. These final changes affect cancelled work
and unavailable-MediaSource handling, not the observed installed Chrome's
successful, noncancelled MediaSource branches; its producer maps are not
retrospectively changed and no extra browser repetition is claimed.

## Final candidate byte binding

Root preserved that pre-final native report as
`native-file-capabilities-initial-results.json`. After final cancellation fixes,
build/source metadata refresh and app CRLF-to-LF-only normalization to its existing
Git contract, root ran the three-case driver once against the final candidate
inputs. `native-file-capabilities-smoke-results.json` now records final3/3 with
matching start/end producer maps. This fresh run qualifies those final bytes;
the earlier raw report remains unchanged. Complete current Node tests557/557 and
publication source checks are in `qa/q1-q2-release-integration`.
