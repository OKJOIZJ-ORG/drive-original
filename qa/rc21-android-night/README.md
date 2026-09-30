# rc.21 baseline / rc.22 gesture correction / rc.23 continuation — actual Android acceptance

Actual authorized Samsung SM-X800 / Android 16 / Chrome 153, existing signed-in
candidate `1.22.0-rc.21`. The native panel is 1752×2800; the observed Chrome CSS
viewport is 824×1191 at DPR 2.125. This is an actual tablet's Android native input
path (ADB-generated trusted MotionEvents), not a simulated phone viewport or a
human finger trial. No iPhone/Safari/standalone/VoiceOver equivalence is claimed.
The coordinator owns the user's updated pre-release Android substitution policy.

The reproduced gesture defect has a narrow local app.js correction, independently
reviewed and passed to the coordinator. Public rc21 was unchanged during these
observations. Production, grants, volume/power/security settings and original
media were unchanged. Existing normal app playback can update own viewed state;
Later50 onward performs authorized own account-state challenges through native
favorite cards and normal15s account polling. State and fresh timestamps remain
separate from original media mutations. Original identifiers, credentials and
unrelated tabs were never exported. Private native screenshots are ignored.

## Decisive current observations

| Acceptance clause | Actual evidence | Limit |
| --- | --- | --- |
| QA-UI-01/03, D-056 | `03-touch-playback-result.json`: center tap pauses with controls hidden; entry reveals while preserving pause; center dismiss preserves pause; center resumes with controls hidden; entry reveals while preserving playback. `14-native-controls-cleanup-result.json` records trusted native entry and normal close events. | Tablet Android portrait. The original iPhone hit-area report remains a separate platform test. |
| QA-TR-03 | `15-native-qualified-controls-result.json`: paused native seek 10/50/90% has independent `requestVideoFrameCallback` targets 133.2 / 666.8 / 1200.4 seconds at 1280×720. App seek generations 4/5/6 settle; no loader/error. | One 1333.614875-second actual native Q0/range source. Audio fidelity, all formats and cross-device source identity remain separate. |
| QA-TR-12, native return clause | `11-native-detached-return-ready-result.json`: no debugger remains attached during Home; launcher foreground after Home and after32s. Passive journal observes hidden→visible for34.107s, video time6.281552→40.389923. Return plays42.434247s/558frames;5s later47.557591s/711frames; no error. | One actual Q0 source and one OS-return interval. Not token expiry, full-hour playback, lock/sleep, Q1/Q2 or iPhone. |
| Next and horizontal gestures | `15-native-qualified-controls-result.json`: visible topbar next changes selected source; right/left native swipes reach their internally frozen expected targets with new presented frames and no loader/error. | Three transitions. Not50-cycle endurance or an OS edge-back matrix. |
| Long press / diagonal | `08-native-seek-gestures-result.json`: trusted same-point1200ms long press and short diagonal do not change selection; playback resumes healthy. | Limited observations; full multi-touch/context-menu/OS cancellation row not accepted. |
| Vertical random | `16-vertical-discriminator-result.json`: isolated up commits with first movement above12px. `17-sequential-vertical-discriminator-result.json`: eligible native first movement11.8px stays unclaimed; next movement becomes uncancelable and cancels both horizontal/vertical sequences. | Reproduced rc21 defect. Local reservation correction awaits candidate native verification. |
| Native two-contact cancellation | `22-native-two-contact-result.json`: actual Android SOURCE_TOUCHSCREEN MotionEvents produce trusted count2, cancel active X drag, preserve selected source and healthy playback60→210frames. | Official scrcpy4.1 control-only server; no human-finger, pinch/zoom/OS edge matrix or endurance claim. |
| Portrait renderer fullscreen and native Back | `19-native-visible-fullscreen-back-result.json`: visible control enters mediaStage fullscreen, exits, native KEYCODE_BACK closes owners. | API fullscreen and tablet hit geometry only. Native screenshot still shows Chrome/OS bars; no system-chrome disappearance, rotation or iPhone-safe-area claim. |
| Normal close | `11`, `14`, `15` final samples: sheet closed, q0/q1/blob/frame owner indicators false. | JavaScript indicators only; not independent worker-retirement or full memory plateau proof. |

No original69-row status or42-row mapping was overwritten. These are scoped
clause observations, not whole-row acceptance promotions. `acceptance-clauses.json`
links decisive producers/results to current clauses and preserves critical limits.

## Observer-conditioned failures and recovery

Official cached Chrome DevTools MCP1.10.1 `McpPage.init()` calls
`pptrPage.emulateFocusedPage(true)` unconditionally. `McpContext` creates/initializes
each McpPage once and caches it. Keeping this connection active makes Android Home
appear document-visible to the app. Native launcher foreground alone cannot prove
the page receives hidden lifecycle events.

- `03` and `04`: real native Home/return fails, but page visibility never becomes
  hidden. `04` makes zero MCP calls in the32s background interval. These are
  observer-conditioned failures, preserved rather than called an ordinary OS-return
  product defect.
- `05`: a second CDP session with focus=false restores blur/focus, but the original
  MCP session still prevents hidden visibility. Failure retained.
- `06`: fully detaches MCP but keeps another CDP session; the prior failed
  retirement barrier already rejects opening before Home. This is an INVALID
  media-return trial, not new media-return evidence.
- `07`: normal reload recovers the prior sticky barrier, but the app starts at the
  root folder (0 media/13 folders); target readiness fails before media/Home.
- `09` records that state; `10` uses native touch to return to the unique originally
  observed folder without exporting its name/ID. `11` then qualifies initial
  playback, removes every owned debugger connection before Home, and passes real
  hidden/return with a passive event journal read only after native return.
- `08`:90% decoded-frame assertion sampled an app field that was subsequently
  cleared. The desktop next-control selector has a zero rect at this tablet layout;
  fixed-delay navigation/close did not settle. These failed clauses are retained.
  `14` proves native entry/close; `15` uses an independent frame observer, visible
  topbar next and settled navigation. The reproduced gesture failure is separated
  by16/17 and awaits corrected public candidate native verification.
- `01`: native screenshot failed from default child-process maxBuffer. `02` uses
  bounded16MiB binary output and passes. `12`: nonexistent next selector caused a
  safe MCP error; `13` retains a null-aware geometry sample.

## Producers, ownership and reproducibility

Each named attempt has a separate result. Each result pins its producer and common
module SHA256; `provenance.json` maps saved common-module versions to those hashes.
`android-common-v1.cjs` through `v6.cjs` preserve earlier helpers; `provenance.json`
maps each result's exact common hash. `android-inspect-common.cjs` permits only
signed-out read-only diagnostics and retains origin/version fences. Do not rerun an existing
result-writing producer over retained evidence. Copy it to a new named attempt
and change its result filename first; choose the saved common version matching
the intended original attempt when reproducing a historical result.

Owned official MCP clients, native Playwright CDP connections and ephemeral ADB
forwards were closed/removed. No other forward was altered. Native15's independent
frame/touch observers and14's cleanup observers were removed; temporary globals
were deleted. Device ownership stays with this child until coordinator handoff.
No commit was made by this child.

## Local correction and retained later attempts

`21-local-reservation-browser-result.json` tests corrected local app.js SHA256
8f2c468b20300853d0b35249dc812385892ce5f12a3dfd30442aa6ab18654fd9 in the
actual Android renderer at824×1191/DPR2.125 with a synthetic media fixture.
Trusted CDP8px→32px horizontal/vertical sequences commit; two contacts cancel;
touchend owns one tap. This is local synthetic browser-input proof, not native
original-media acceptance. App/static/immersive Node integration passed160/160
in `gesture-integration-tests.txt`; semantic-summary focused checks passed18/18
in `gesture-focused-tests-v2.txt`. Coordinator owns the later full suite.

- `18`: hidden desktop fullscreen selector caused a QA eligibility failure.
  `19` selects the actual visible control and passes.
- `20`: MCP new_page did not yield a localhost target. Its cleanup field
  `ownedQaTabClosed:true` overstates the result because no page was acquired;
  only owned reverse/server/forwards are confirmed cleaned. `21` uses supported
  MCP navigation of the exclusively owned candidate tab and restores its URL.
- `23`: local current-source gestures pass, then summary has zero rect in the
  actual coarse tablet portrait layout. The mobile more control is a button.
- `24`: explicitly synthetic visible placement of the real native summary node
  proves native touch opens details with start/end uncanceled and no stage tap.
  Close assertion fails after artificial relocation; this is not a production
  layout acceptance result. Owned local server/reverse/forwards were removed and
  the candidate URL restored.
- `25/26`: signed-in readiness fence fails;26 waits15s before checking. `27`
  confirms setup, no account/token and idle connect control. `28` uses a wrong
  request-promise identifier and fails safely; `29` corrects it read-only.
- `29`: authStatus=auth-unavailable, revision0/expiresAt0/no pending request;
  existing canonical session resource has HTTP503,1904ms,same-origin. Inspector
  issues no new credential request. Candidate renewal service diagnosis belongs
  to the coordinator; login/grants are untouched. This is preserved historical
  failure, not the current service state after31.
- `31`: one normal app reload under the existing cookie recovers canonical
  session HTTP200/691ms, online/account+token present, revision58 and~48min
  expiry remaining. No login/grant/cookie/reset occurs. Initial library visibility
  precedes data completion; `32` separately confirms root13folders/0media,
  loadingFiles=false, controller present, player closed. PC/Android matching
  revision58 does not independently prove equal account identity.

The coordinator dispatched verified public22. `33` normally reloads21→22 and
confirms actual app.js/SW/index bytes match fixed source
9cd94b8caae8f0e5269bf1df7d413b4e8bbdd303. Only shellcache22 remains; the
controlled, signed-in library settles at13 root folders.

## Corrected candidate native evidence

- `30`: native exact8px→32px left succeeds with expected source/new42decoded
  frames. Up also selects its expected target; video-only postcondition fails.
  `34` discriminates that target as a healthy original JPEG1916×1952, complete
  and visible, no loader/error/pending. Its cleanup removes30 observers and
  native Back clears owners.
- `35`: type-aware native left/up both reach expected actual video targets with
  new27/11decoded frames, no loader/error. Pause/entry clauses pass before a
  hidden mobile-more selector causes QA eligibility failure. `36` records the
  actual coarse-tablet control layout; public playback uses a44px desktop summary.
- `37`: actual native summary opens/closes with trusted uncanceled touchstart,
  touchend and click, active gesture false, playback pause preserved. D056 entry,
  center dismiss and resume pass; native Back clears owners and observers.
- `38`: corrected native two-contact cancellation passes, source unchanged,
  playback71→221frames/time2.22→7.21. Temporary official control-only server exits
  naturally; its exact JAR/forward are removed. Native Back clears owners.
- `41`: closes the decoded/presented distinction from35 with independent
  requestVideoFrameCallback evidence. Exact native8px first move leaves axis null;
  next32px remains cancelable and locks X/Y. Expected left source presents720×1280
  at0.365–0.482s; expected up source presents720×1280 at0.167–0.333s. D056 and Back
  cleanup also pass; independent frame/touch observers removed.
- `39`: wrong eligibility helper name causes a safe MCP error; `40` corrects it
  read-only and records1690files/2folders/full population. There are no TS/MTS/M2TS
  labels here.266 video sizes meet the cheap188-byte eligibility hint; that is
  not TS/container/Q1 admission evidence. Native API capabilities do not prove Q2.

The original69 statuses and remaining42 mapping are retained. Corrected gesture
clauses are actual native Android proof, not whole-row/iPhone promotion.

## Actual additional sources and Q1 qualification

`42` uses one smallest video per declared extension, normal in-browser search and
native card tap. Names/IDs remain inside the browser. No route is forced.

| Declared source | Bytes | Actual route / independent presented frame |
| --- | ---: | --- |
| WebM |318571| Q0/range338×600 at2.875–3.188s |
| MOV |105656| admitted TS/Q1,360×640 at0.988–1.088s |
| MKV |6803156| admitted TS/Q1,360×640 at2.157–2.257s |
| AVI |9936740| admitted TS/Q1,360×640 at2.498–2.640s |

These prove the selected original sources, not true QuickTime/Matroska/AVI
container decoding or Q2. Each native Back clears owners. Search, diagnostic
sink and independent frame observer are restored/removed.

`43` qualifies the159.164s AVI-labeled TS/Q1 source. Native paused10% presents
15.878477s/360×640. The subsequent50% sample fails Q1phase/mode, no target frame,
error UI, ready0; Home is never issued. `44` preserves passive failure state:
native error null, online revision58 with~140s expiry remaining. Its lookup uses
the wrong stats field (`error` instead of `failure`), so exact machine code is
unknown. It restores search/observers and closes all owners.

`45` repeats the10→50 native sequence with correct failure/timeout fields. Its
first qualified playback already uses refreshed revision59 with~1h expiry.
Both targets present15.878477s/79.545144s at360×640, phase ready, failure/timeout
null, no error/loader. It closes owners and restores QA state. This credential
contrast is a discriminator; it does not prove the cause of43. Natural expiry
continuity remains unqualified by45;47 subsequently qualifies90% and native Q1
Home return on public23.

## Public23 Q1 and actual lifecycle continuation

`46` uses one normal22→23 app reload and verifies actual app/SW/index hashes
against source7591044adc1149391265b0e56a93a47252088a47. `48` settles to only shell23,
activated controlling SW, no installing/waiting worker. Existing online account
revision59 is observed; matching PC revisions alone are not account identity proof.

`47` presents actual Q1 paused10/50/90% frames at15.878477/79.545144/143.259433s,
all360×640, phase ready and no loader/error/watchdog. It seeks near start, resumes,
detaches all owned debugger/MCP connections, and sends native Home/recents return.
Passive visibility journal proves genuinely hidden30.573s, preserved Q1 owner and
session, time9.478295→40.051171s and35→245frames. Direct CDP first read after return
is41.64786s/283frames;5s later46.667943s/388frames, playing/no error/loader. Native
Back clears owners; search/frame/lifecycle observers are restored/removed.

47's foreground-package parser looked only for `mResumedActivity`; its false
Chrome/launcher booleans are unqualified. `49` distinguishes Android16's actual
`topResumedActivity` field and independently verifies current Chrome foreground.
It does not retroactively supply a launcher package observation for47. The actual
hidden journal and native input sequence independently establish the lifecycle
clause. No duplicated Home experiment or physical rotation claim is made.

## Foreground canonical-state challenge

50 installs browser-private full prestate/unique target then reports an unclassified
QA operation failure.51/52 discriminate the prepared private context and normal
card; baseline favoritefalse/updatedAtnull, prior viewed timestamp captured, no
mutation. Account/generation/writer fences stay browser-local. Private config
supplies the exact priority filename; maintained producers export no target IDs,
names, account keys or writer keys. The actual library favorite button is32×32 CSS,
so this trial does not prove a44px card favorite hit area.

53 receives the PC native-card fresh favorite true timestamp1790785858391 via
normal poll; first observation is62.295s after challenge, already converged, so its
receipt latency≤60s is not proved.55 independently direct-reads canonical remote
appData documents, bypasses account-state read cache and confirms the exact target
favorite/value timestamp without applying it.54 native Android unlike produces
fresh timestamp1790786029257 and restores baseline favoritefalse.

56 arms a page-local passive250ms change sampler before a second PC native-card
challenge.57 records exact favorite/cardtrue timestamp1790786132242 received at
1790786147169:14,927ms, with visible/account/generation/writer fences unchanged.
No refresh/reload/refocus is forced.58 direct remote cache-bypass read confirms the
same target timestamp.59 trusted native Android unlike creates1790786282507 and
again restores baselinefalse; sync idle/no errors. PC reverse observation is owned
by the coordinator.60 arms viewed-state passive timing before PC normal playback.

Favorite restoration uses the normal owner and a newer false tombstone; it does
not rewind timestamps or overwrite full prestate. The prior viewed boolean was
already true; a normal replay may advance its monotonic viewed timestamp. Actual
two independent device browser processes plus canonical remote readback prevent
a shared in-memory/local account-state cache from being the sole proof. Same
account operational proof depends on both directions and the coordinator's remote
readback; no raw identity comparison is claimed here.

61 records normal PC playback's viewed timestamp1790786378420 at Android first
receipt1790786394835:16,415ms.62 directly reads canonical remote data without
cache and confirms the same viewed timestamp plus finalfalse favorite timestamp
1790786282507.63 confirms semantic favoritefalse and viewedtrue baselines, sync
idle/no error, removes own timers/click observer/private prestate, and restores
normal search without changing product timers or overwriting account state.

The coordinator reports finalfalse echo on PC at16:39:00.302Z (57.795s after59).
Its prearmed bounded sampler had already expired before receipt; that QA timeout
is retained and is not a product root-cause claim. Actual two-device favorite
convergence and PC→Android viewed are established. Original QA-ST-01 calls for
both viewed directions; Android→PC fresh viewed remains necessary for a full row.

64 privately prepares the same unique target for reverse viewed.65 sends one
normal native card tap, then fails because its QA observer incorrectly references
`state.currentPlaylist` instead of the actual `state.selected`.66 repairs the
observer read-only on already running playback, without another card tap/manual
mark or reload. The exact target has new viewed1790786817110 and independently
presents360×640 frames at61.688–61.821333s, Q1/ready4/playing/no loader/error, all
fences stable. These are later presented frames, not a recorded first frame at the
viewed timestamp. Normal product observation owns the viewed update. Native Back
closes all owners.67 direct remote cache-bypass confirms this exact viewed record;
68 removes the independent frame observer/private target/docs, restores search,
and preserves favoritefalse/viewedtrue semantically. Coordinator PC passive receipt
and its private unrelated-record comparison own the final full direction proof.

Native22 uses a uniquely named temporary JAR and socket. It sends touch messages
only; video/audio/clipboard autosync/power are disabled. No APK is installed.
The server exits naturally on control-socket closure, its exact owned remote file
and ADBforward are removed, and native Back closes the app player. Downloaded
upstream protocol sources are research copies, not acceptance producers.

## Public24 source, actual Android synthetic Q2 and natural renewal

69 performs an ordinary app update/reload to public24 source
8a2894ee2c7aa85c9cb2ff992879f4580e15e2e7 and verifies exact app/SW/index
hashes.70 confirms activated current controller and only shell24. Revision60
was already current at this reload;59→60 ongoing-player continuity was not
observed.

71–78 isolate immutable public24 product bytes on an owned localhost fixture
server and ADB reverse, with a synthetic Drive provider. Original account/media
are not fixture inputs.71 preserves a hidden-library setup failure.72/73 preserve
full-body transport delays;73 discriminates credential-ready and actual SW header
504 at10s from missing-token hypotheses.74–76 select Q2 on the small fixture but
lose the owner after actual controller replacement;76's passive SW journal
observes this replacement.75's settled startup does not fix that failure.77
records byte-identical main/import SW responses and actual ready Q2 frames, then
fails its prematurely read encoder counter. These failures remain evidence.

78 moves that counter assertion after real native playback end. The synthetic
6s490614-byte AVC320×180/24fps plus AC3 stereo48k fixture has SHA256
f2e59fee0507e1523942fce6cf03c0b39ae0281775fe8c0c86240ac8a6322b2d.
Normal native card entry automatically selects Q0→Q2, presents320×180 frames,
and reaches real ended/paused at6s with140 decoded frames. The completed product
pipeline reports videoEncodersCreated0/audioLiveContexts0/audioFailures0.
One SW version remains;14 ranged SW requests transfer1178788 bytes with no
provider errors. Native Back clears owners and retirement settles. Owned
interceptors/CDP/server/ADB reverse are removed and public24 is restored. This
is actual Android playback of synthetic input, with no original AC3,420s Android
duration, independent encoder clock or audible-fidelity claim.

79 preserves the parent passive observer4a2107c7ebab5ab8aeceb1513b0b040869b28ca62a9432d6b0430cf692c293eb
and builds the Android scope derivative
ff6bc8d856d85bf6f82d55fd3caf1f5415b1f0f5aaeaab6ad1e68f6ff0c72154.
The only expression change is its platform scope sentence.80 verifies exact
public app/SW/version hashes/current controller, then normal native card entry
starts the private original priority source, actual Q1 duration1609.408s and
360×640 presented frames. Source proof and target fences remain browser-private.

81 starts a passive natural watch at17:51:45.450Z for revision60 old expiry
18:02:33.031Z. It makes no seek/Home/reload/loop/volume change, closes official
MCP and removes focus emulation, reads only safe observer state and native Chrome
foreground booleans. It fails OWNER_CHANGED before expiry at~123s; the last
healthy sample is media305.854667s/frame9141,123 observer frames/maxgap1039ms,
no credential requests or renewals. The observer releases and restores fetch.
83 reads without retry/reload: a different selected source is now healthy Q1,
duration487.189311s/time390.419088s, current activated controller and revision61
expiry19:01:03.188Z. This later credential advance does not prove same-owner
continuity. The source-change path is unknown; no input/ended journal qualifies
its cause.82's post-success seek/close producer remains unexecuted.

84 normally closes the current player with native Back, confirms all media/frame
owners absent and retirement settled, restores search and removes the private
released observer/proof/target. It does not force credentials or rewind account
state.

85 builds a separate synthetic420s AVC160×90/12fps plus AC3 stereo48k input.
86/88 preserve unexecuted producer derivation and focus-harness correction;87
is not executed.89 automatically selects Q2 but deliberately fails the actual
color qualification boundary AUDIO_VIDEO_COLOR_UNQUALIFIED because this input
omits color metadata.90/91 build a new explicit BT709 matrix/limited-range
synthetic input:5579274 bytes, SHA256
a515eadea419ef900a2e718bdcdff0604ccb3214f580ba5f5723a283803233b3.
This is a fixture correction; public24 product bytes remain immutable.

92 derives93 from89 with the new fixture and correct fixed-code failure lookup.
93 reaches automatic Q2 ready and independently presents160×90 frames, then
fails GENERAL_REMOVE_CURRENT_RANGE at~8.6s.94/95 add passive native
SourceBuffer.remove instrumentation on exactly this same fixture, without
changing removal arguments or route. At currentTime8.593685s,
remove(0,0.593685) is requested with buffered range[0,39.094666]. At updateend
8ms later, currentTime is8.604036 and the remaining range is
[18.333333,39.094666]. Current playback was removed through the next random
access point. Owner is present/not aborted, no controller change/provider error,
and103 actual presented frames reach8.583333s. This discriminates the general
player's pruning layer from auth/transport; the420s continuity clause fails.
All owned fixture transports are cleaned and public24 is restored after89/93/95.

96 adds bounded terminal owner-fence Boolean mismatch names and a128-event
trusted UI journal to the original Android renewal observer. Fixed zones and
event types export no DOM text/IDs/coordinates; keyboard output is navigation
allowlist or null.97 repairs the unexecuted prototype-property key-lookup
counterexample using Map.98 is a local VM privacy/lifecycle fixture: private and
prototype keys become null, an isolated selected-file change reports only the
file fence, untrusted input is ignored, the journal stays bounded and all nine
capture listeners plus media listeners/fetch wrapper are released. The v2
expression SHA isfb82921316fd76b323e5536c86653c6f16b3c072ec607c71eb03f687dbfc2b6b.
This observer has not yet been executed on the device and remains bound to24;
a later candidate requires fresh binding and actual source/controller proof.

99 reproduces the synthetic keyframe analysis with ffprobe and binds the exact
95 result/fixture hashes. The native remaining range starts exactly at the next
random access point18.333333s;22 source keyframes are recorded.100 normally opens
the same private original priority source after fresh public24 app/SW/version
hashes and current activated controller proof. At18:40:18.880Z it presents
360×640 TS-Q1 frames, actual duration1609.408s, playing/no error/loader, revision61
expiry19:01:03.188Z.101 is a fresh prepared natural-watch producer using the
independently reviewed telemetry v2; its execution result, not preparation,
determines the continuity clause. Public24 remains frozen during that watch.

101 executes the independently reviewed v2 observer at18:49:38.575Z with
revision61 old expiry19:01:03.188Z and685s remaining. A single natural credential
request at elapsed594617ms returns200 in2056ms; revision advances to62 at
597001ms with expiry advanced and account/source/owner/controller/drive-session
fences unchanged. It completes19:03:04.151Z after the old expiry plus120s, with
799 passive presented callbacks,121 after old expiry and max frame gap3813ms.
Failures/fence mismatches/trusted DOM event counts are empty. Fetch is restored,
all nine capture listeners are removed, and owned MCP/CDP/ADB forward clean up.
No seek/Home/reload/loop/volume/forced credential or clock change occurs during
the watch. The retained81 failure remains a separate earlier observation.

82 then executes once after the coordinator confirms the PC corpus is quiet.
Native paused midpoint seek on the same source/revision62 independently presents
804.688s at360×640 against UI804.704s/duration1609.408s, settled generation1,
no error/loader/watchdog. Normal native Back at19:04:55.662Z clears Q0/Q1/blob/
frame owners with retirement settled. Search is restored; private observer,
proof and target are removed; owned MCP/forward clean up. This qualifies one
original-source actual Android renewal/seek/close clause on24. Candidate25
publication and fixed synthetic420s proof are subsequent units, not inferred.

103 normally updates the existing Android public candidate to25, then104 settles
the exact current activated controller. App/SW/index immutable source hashes
match7ba8e654fa38def8c8e00efcbf1600a4c8730c53; existing account revision62,
only current25 shell and no installing/waiting worker. No login/grant/reset.

105 uses the same qualified synthetic420s AVC/AC3 fixture on the actual Android
renderer through automatic Q0 to Q2. Nineteen native SourceBuffer removals preserve
the current range; max presented-frame gap171ms. It fails near EOF after actual
404.166666s/presented4832 withGENERAL_OUTPUT_FRAGMENT. Transfer11683788B/97ranges
and no provider errors. Native420s/end/pipeline counters are unproven;105 failure
skipped normal settled-close assertion. Its owned transports/provider/server are
cleaned and106 independently confirms restored public25/all owners absent.

107 performs a fresh normal native center pause, designated control entry and
95% seek on the same qualified fixture/source. A presented398.916666s160x90
frame is followed byGENERAL_OUTPUT_FRAGMENT after1110ms. Passive numeric worker
metadata (observer77f2335f validated by109 fragmented7-byte box fixture) shows
the final116Bmoof has only known audio track2; video track1 is absent. tfhdflags
131128/payload20,tfdtv1/decode645013504,trunv1/flags513/sample4/payload28,
followingmdat3675B. Penultimate moof hasvideo47/audio196; parseCode0. This
discriminates the known audio-only tail against malformed/unknown track cases.
No media bytes or original/private identifiers are exported. Transfer7686092B/
36ranges/zero providererrors. Normal nativeBack/awaitretirement confirms all
owners absent/settled; prototype/listeners restored and owned MCP/CDP/ADBforward/
reverse/server/provider cleaned before return to public25. Diagnostic PASS
reproduces product failure; full420/nativeended remains unqualified. Root owns
causal product repair and subsequent candidate publication.

111 qualifies the public25 native card hold/release/cancel/movement clause.
1100ms stationary native hold selects exactly one card; trusted contextmenu is
defaultPrevented; release opens no player/Q0/Q1 and leaves no pending hold or
DOM text selection. Native cancel restores selection0. Native40px movement
produces pointercancel and no selection/player/pending hold. Search input
userSelectauto is preserved, but this is a computed-style check, not an actual
input-editing trial. Cancel button actual44x34CSS; no44x44 claim. Observers and
own MCP/CDP/forward are removed; no canonical or original media write occurs.

113 separately opens the normal original priority source on25 (ordinary viewed
state write) and qualifies temporary actual renderer prefers-reduced-motion CSS
0.16s to0.00001s, then restores the preference. It fails its edge-retreat
expectation: native1CSS to42CSS to1 intended path is interrupted by trusted
touchcancel and player closure. Separate ADB motionevent commands lack stable
contact qualification; nativeOS/browser history may have correctly committed
back. No product defect/actor or successful cancellation is inferred. Normal
cleanup confirms player/Q0/Q1/blob/frame owners absent/retirement settled,
preference restored/listeners removed/private target and query cleanup. Native
rotation control is zero-size on824px portrait tablet; physical rotation remains
UNKNOWN. Prepared115 uses owned stable scrcpy contact plus passive popstate and
fixed Boolean close-request journal to distinguish edge behavior; preparation
is not actual execution proof.

117 confirms native input editing beyond111 computed-style evidence. Safe QA
text is typed through trustedbeforeinput/input, nativeDEL andZ edit the expected
value, and1100ms native hold selects14characters with a trusted unprevented
contextmenu. Thus card hold menu suppression coexists with native input selection.
Only equality booleans/counts are exported; priorprivatequery staysbrowserlocal
and is restored. NativeBack/blur/observer/MCP/CDP/forward cleanup; no canonical
state or original media mutation.

115 executes the owned stable scrcpy4.1 one-pointer transport. Native1CSS to
10CSS then retreat produces touchcancel but no popstate or appclose request;
the same original Q1 owner remains playing/frames45to70/time1.38to2.22, media
axisnull/activityfalse. Separate continuous1CSS to260CSS yields touchcancel
and exactly one trustedpopstate without player mark; player closes without
apprequestClose. This distinguishes native/browser-history ownership from a
custom app media swipe. Earlier113 intendedretreat failure remains preserved.
All owners clear/retirementsettled, fixedBoolean journal wrapper andlisteners
restore, privatequery/target cleanup, scrcpy socket/server/ownJAR/forward and
MCP/CDP/forward cleanup by20:05:04.155Z. No physicalrotation/phone/iOS/whole-row
promotion; only one original-source portrait tablet edge clause is qualified.

After Codex restart,121/122 use existing authorized Android connection and normal
reload25to26: online64/currentactivatedcontroller/noinstallingwaiting/only26shell,
exact app/SW/index source3eea49a4853052275582979ab205eee8026c4691.123 native
paused95% again presents398.916666s, then accepts the same116B audio-only final
moof/trun4/mdat3675B. Phasebuffered-to-end/noerror/workerterminated, nativevideo
encoders0/audioContexts0/failures0; normalBack/retirementsettled.105/107 failures
are retained and no nativeend claim comes from this narrow seek test.

124 then plays the qualified420s syntheticAVC/AC3 through automaticQ0toQ2 at
native1x to a true nativeended event. UI420/native420.0065, lastpresented
419.916666s160x90/presented5022/decoded5039, sameowner/maxgap173ms/19safeprunes.
Initial normal fallback sourceclock target0.205962 is recorded; this is fullclip
endpoint proof, not420pureQ2seconds. Finalaudio-only116Bmoof/trun4/mdat3685B
is accepted, one passiveMSEEOS open toended/noerrorarg. Worker86chunks/86ACK/
pending0/activeReads0/invalid0/terminated,18165packets/output19041362B/source
cleanupsettled,videoEncoder0/audioContexts0/audioFailures0. Provider11683788B/
97ranges/zeroerrors/controllerjournalempty. NormalnativeBack/awaitretirement
allQ0/Q1/blob/frameownersabsent/settled21:25:00.705Z; observers/prototypes and
owned MCP/CDP/ADBforward/reverse/server/provider cleaned. Synthetic proof only,
no originalAC3/audiblefidelity/video-byte checksum claim.

125 independently confirms restoredpublic26/online64/currentactivecontroller/
exact3sourcehashes/allownersabsent.126's local expected40requestpaths assertion
fails beforedeviceinvocation; immutableSHELL_FILES has41paths because root and
index alias40uniqueassets.128 records the narrow harness correction;127 confirms
all41cachedresponsehashes exactimmutable26,41entries/extras0/no network/refill.
This Android update passes a scoped clause; coordinatorPCnormalupdate failures
remain separate.119 and source-independent offlineconflict helper are prepared
only: no networkemulation/canonicalwrite/actualresult yet. Private baseline will
stayrecoverable in an ownedbrowser-sessionStorage key, fullrawDocs/cache/state
remainbrowserlocal and cleanup awaits jointcanonical/non-target/fence proof.
