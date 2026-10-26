# OPEN QUESTIONS — registered, not remembered

## 2026-10-04 — D083 finite extra startup observation

UNKNOWN: first1.23.1 normal Android replay timed out45s when opening the long MP4 after short EOF/tracks. No failure-time media/transport trace was captured, so SW replacement, transient Drive/network and native startup cannot be distinguished. After exact activated liveSW1.23.1 admission and diagnostic capture were added to QA only, the entire actual operating replay passed without product change/redeployment. Preserve prior JSON; if repeated, inspect the newly captured failedState before choosing a fix. This is not the diagnosed track-discovery delay, which now completes with known metadata and unsupported-switch status. Owner: qa/uiux-polish/README.md and private maintenance/tools/uiux-polish.

D084 update2026-10-04: six discriminating actual starts (three each short/long)3.165–3.198seconds matched both old readiness and real media/frame progress.15-minute uninterrupted native1x also passed; playback implementation remains unchanged in1.23.3. No reproduction or failure-state evidence resolves the earlier cause, so UNKNOWN is retained rather than applying a speculative playback fix. qa/uiux-followup/README.md owns results and captured state for any future repeat.

| ID | Question | Opened | Status |
|---|---|---|---|
| A-001 | Does the exact candidate pass actual iPhone Safari and standalone edge-back acceptance? | 2026-09-17 | OPEN; no physical iPhone session. Procedure and evidence owner: ACCEPTANCE-20260917.md. |
| A-002 | Do two independently authenticated physical devices converge through the real Google account? | 2026-09-17 | OPEN; synthetic contexts do not close this gate. Procedure: ACCEPTANCE-20260917.md. |
| A-003 | Does the hardened offline replay fixture pass with upstream requests explicitly blocked? | 2026-09-17 | CLOSED 2026-09-19: explicit upstream block, unchanged remote store/peer while offline, reconnection convergence and reload identity all passed. qa/release-1.21.0-acceptance/results.json; IMMERSIVE-20260919.md. This does not close real-device A-002. |
| A-004 | Does v1.21.0 maintain the intended session through actual Google expiry, sleep/wake and Safari/PWA renewal? | 2026-09-19 | PARTIAL2026-09-28: active rc.10 candidate passes one actual PC natural credential renewal during6min1x original Q1 playback, old-expiry progress, subsequent seek and retirement; Q1-LIVE-20260928.md. Productionv1.21.0 is separate/unexercised. Actual sleep/wake, Safari/PWA renewal and broad long-duration acceptance remain open. |
| A-005 | Which exact currently failing file version, browser/device and network condition will be the v2.0 discriminating sample? | 2026-09-19 | CLOSED as a user-input blocker 2026-09-19 by D-050: exact path and PC/iPhone Chrome/PWA observations were supplied. Drive ID/version and the first-stage trace remain implementation evidence to obtain in V2-01C, not another user-choice gate. |
| A-006 | If evidence requires architecture B or C, which operating condition is acceptable: always-on Windows/NAS/cloud host and new HTTPS origin/OAuth client, or signed native installation? | 2026-09-19 | CLOSED 2026-09-19 by D-050: browser/PWA, no always-on personal PC/NAS, minimal free B-auth, direct media first, no user-facing native deployment. Any media relay still needs same-file evidence. |
| A-007 | May a disposable Drive folder/file be used later for live trash/move/readback/recovery acceptance? | 2026-09-19 | CLOSED 2026-09-19 by D-050: this run may create uniquely identified test data and move, trash, restore and independently read it back; existing user files and permanent deletion remain excluded. |
| A-008 | Can this user's Cloudflare Free account activate Workers Static Assets, a `workers.dev` candidate hostname and SQLite-backed Durable Objects without a card, paid plan or automatic billing? | 2026-09-19 | CLOSED 2026-09-20: the no-card candidate serves Static Assets and the SQLite-backed Durable Object at the fixed `workers.dev` origin; version `28d2a9fc-730e-48d4-b060-8e49554a8c7b` and its bindings/config were read back. No paid plan, card or automatic billing was introduced. |
| A-009 | Can the existing Google Web client be reused for the same-origin server callback with its client secret, minimum required Drive scopes, suitable publishing status, offline refresh credential and unchanged appData visibility? | 2026-09-19 | PARTIALLY CLOSED 2026-09-20: the existing client/secret and exact candidate callback complete a real code flow, install a server session, return credential 200 and list the same account in PC Chrome; the physical iPhone PWA also returns to the real list and survives a full relaunch. Actual token-expiry refresh remains A-004, and same-account appData snapshot/read/compare remains V2-08A; candidate writes stay disabled until that gate passes. |
| A-010 | Why does the designated overlay-only touch area fail on the actual iPhone, while pause correctly leaves the overlay hidden? | 2026-09-28 | USER-REPORTED/QUEUED by D-055, clarified by D-056. Requested rc.10 version and supplied playback user-confirmed; exact hit area/browser mode/regression version unknown. Mid/end seeks and30s home-return remain unverified. Reproduce hit area/event ownership under D-048; overlay-only touch must preserve playback state. Never reveal controls merely because playback pauses. Continue current disposable QA first. |
| A-011 | What action/writer/device accounts for later viewed-state changes during disposable QA follow-up? | 2026-09-28 | OBSERVED/UNKNOWN: immediate post-run cache/projection equality passed; later2viewed added/1timestamp changed, favorites unchanged, baseline retained, no QA IDs, runtime/cache equal. Entire delta is not explained by current remote read cache. Account/controller/writer/readOnly/idle stayed stable. DISPOSABLE-20260928.md records scope; no product defect or cause asserted, no unrelated repair authorized. |
| A-012 | Why did the final cross-inventory comparator reject after all36 current bounded probes passed their own identity checks? | 2026-09-28 | OBSERVED/UNKNOWN:247dispatches/51media/1002780bytes,36processed; each internal repeated inventory passed, final wrapper CATALOG_DRIFT/completefalse. Original comparator code and differing dimension were not retained. Read-only source audit found no deterministic invocation/isolation defect. Later metadata-only two-inventory comparison must preserve whitelisted cause and fixed root/account/item/shortcut/counter difference counts before release; no body replay. CORPUS-RC10-20260928.md owns scope. |

## Readings in force — assumed, not decided

A-013 (2026-09-28, UNKNOWN): why did appData catalog return403 after one
own-writer POST, while later same-account catalog/complete readback succeeded?
Earlier pre-submit2GET read_failed has no retained HTTP cause. Later actual
403 status is retained, provider reason unknown. OWN-WRITER-20260928.md records
final raw confirmation without CREATE replay. Obtain whitelisted provider reason
before attributing rate limit/permissions or changing retries. Deferred under D-058.

Implementation follow-up (not a user-choice blocker): one priority local browser
full run failed Q1_SOURCE_READ_FAILED near299s; final instrumented rerun passed.
Preserved qa/q1-priority/browser-source-read-failure.redacted.json. Exact cause
unknown; V2-06B must discriminate transient range/metadata failures and recovery
without weakening revision/cleanup fences. Do not infer continuous stability.

2026-09-28 follow-up: Q1 SW401 rejected-body cancellation now terminates within
two seconds and fences later Q1 reads, including an abandoned page response.
This is not a full transport retirement proof: generic Q0/direct-buffer replacement
after an abandoned response needs its own discriminator. Keep V2-06B partial;
do not treat the upstream abort request or generic path as confirmed cleanup.

2026-09-28 resolution of that local Q1 transition follow-up: rc.10 tracks SW
owners before headers/credentials and gates Q0/direct-buffer replacement on
confirmed local+SW retirement. Late queries/fetches and downstream/stale-fallback
counterexamples are tested;50actual-app cycles leave SW owners/fences0. See
Q1-RETIREMENT-20260928.md. Real expiry/duration, generic Q0 network-resource
release, total heap/device memory and historic299s READ_FAILED remain open.

2026-09-28 user-profile continuation: the already authenticated normal Chrome
candidate is accessible and restores without another login; isolated managed
Chrome's anonymous state is not a user login blocker. Controlled actual complete
remote snapshots and runtime reconstruction pass (STATE-SNAPSHOT-20260928.md),
but candidate-local pending state remains and legacy-origin/device/fresh-origin
migration is not verified. Candidate writes stay disabled. Natural expiry/sleep-wake
and exact live priority/full-format playback remain separate open evidence.

| ID | User's words (verbatim) | Our reading (`assumed`) | Breaks if wrong | Ends when | Relied on in |
|---|---|---|---|---|---|

## 2026-09-30 — actual worker replacement and remaining reload chain

Actual19→20 SWreplacement cancelsQ1 silently andmakesoldworkerretirementunconfirmed.21boundedrepair showsreloadrecovery andkeepsfalsebarrier. Six isolatedsame-scope replacement→reload→reopen aggregates stayfailed; v3-v6observeanothercontrollerchange/safeerror innewdoc despitefixedmain-script hash/canonicalupdatewait. Importedscript/cache/activationcontinuity cause remainsUNKNOWN. Separate stable21current-owner decode/close ispassing, notintegrationchainclosure. WORKER-UPDATE-RECOVERY-20260930.md/qa/rc21-controller-change ownpreciserecords. Natural19credentialdeadlineadvance/postdeadline20frame observed; uninterruptedbefore/afterposition criterion remainsopen.

## 2026-09-30 — environment-only preparation, D-064

Product execution is waiting for the human's explicit nighttime start. Android
connection is explicitly deferred; portable scrcpy/ADB is prepared, with no ADB
device detected. Existing Cloudflare account-home login is observed in normal
Chrome. Corpus extension file-URL permission/manual toggle remains unanswered
and unverified; no setting changed. Codexon shutdown was explicitly authorized,
performed and followed by a passing memory readiness check. No physical/iOS or
full-goal acceptance is inferred. NIGHT-ENVIRONMENT-20260930.md owns prerequisites.

Before the scope change, new controller continuity evidence showed equal compiled
main/imported script bodies through four actual activations and stable no-media
routed/unrouted controls. Fixed Buffer serving is the prepared next discriminator;
its two existing attempts stopped at the old memory floor before browser launch.
Preserve those failed records and execute a new attempt only after explicit resume.
Current memory recovery removes that launch blocker without establishing the
replacement/reload/reopen behavior. qa/rc21-hosting-security records actual official
aggregate analytics and local synthetic security; exact plan/billing safety and
null/omitted effective observability still need narrow logged-in dashboard reads.

## 2026-09-30 22:35 — preparation blockers resolved, D-065

The17:12Android deferral and unanswered file-URL prerequisite above are historical.
The human manually authorized USB debugging and confirmed the PC file-URL toggle.
Observed one authorized SM-X800/Android16; official Android Chrome MCP reads the
exact rc.21 signed-in library with SW control. Personal PC Chrome filechooser
reads147087QA bytes with the exact local hash, without network upload or factory
execution; the temporary fixture is removed. Evidence:
`qa/android-environment-20260930/README.md`.

Only these environment prerequisites are resolved. Explicit nighttime start is
still pending. Same-account PC/Android identity, physical playback/gestures/OS
return, iPhone/VoiceOver, full formats/SW recovery/expiry and production gates
remain open. The agent changed no security setting or grant.


## 2026-09-30 — D-066 resolves start and current iPhone gate

The human explicitly starts the entire remaining queue now and accepts actual
Android for current mobile acceptance. iPhone Chrome/Safari/standalone/VoiceOver
checks move to post-deployment followup; do not label them passed or require them
for current G5. The environment-only start wait above is superseded. Current
independent executable work continues through savepoints. Separate G6 production
authority, actual account/format/expiry/state/security criteria remain.

## 2026-10-01 — user PC player screenshot defect

RESOLVED (candidate29 evidence): actual PC stage fills the viewport but video/chrome both shift upward,
leaving a large blank lower region; favorite control appears twice. Source28
geometry1536×639.2 shows shared -137.6px offset. Scroll/focus/overflow is a
testable hypothesis, not confirmed cause. Upper-left1.0x ownership unknown.
Root owns integration; qa/rc29-pc-player-layout owns local reproduction/fix.
Preserve distinct previous/next-video versus frame-step actions and D056.
Resolution: the responsible layout and duplicate-favorite correction passed five
local native viewports and actual PC/Android in CANDIDATE-RC29-20261001.md. The
upper-left third-party speed overlay is separate; no unsupported ownership claim.

## 2026-10-03 — current normal Chrome file chooser runtime boundary

RESOLVED for the actual-account fixture workflow (2026-10-03): filechooser still reports fileURL denied and the flag itself is UNKNOWN; settings security-policy denial and native failures remain. Same existing normal connection worked without another approval. Dedicated Google Drive connector matched current app email/root and created one generated file; current app independently checked ownership/SHA/MD5, then real Q0→AAC2/Q1 tuple+metadata verification and recoverable trash/readback/full cleanup passed. Private ledgers are ignored. No setting bypass/newgrant/profile migration/product redeploy. CANDIDATE-RC37-20261003.md owns exact evidence/limits; no further user action is pending for this resolved unit.

## 2026-10-03 — D075 closes concrete G6 production boundary

RESOLVED: the direct continuation following the explicit remaining main/push/production request authorizes that phase; source54e786f/operating1.22.0/Workere70754c7 and legacyPages20d864c are published and verified. RELEASE-1.22.0.md owns final evidence. No pre-release user-input gate remains. D066 physicaliPhone follow-up and original conditionalUNKNOWNs remain open in their original scope; this resolution does not close unrelated historical questions or create universal evidence.

## 2026-10-03 — original-spec acceptance remains open after release

Current BMP QA-FM08 actual proof is UNKNOWN; next prepare one current identity-bound read-only header/viewer/close witness. MEDIA06/09 actual-device sustained Q2/Q3 memory/thermal/processing qualification incomplete; representative bounded actor/observer/cleanup must be prepared first. QA-SW01 historical active replacement failures remain unresolved; compare current safe-version contract before targeted reproduction, with no current production failure claim. RELEASE-1.22.0.md owns exact matrix and limits. Controlled20pairs complete, corpus-budget omissions are not an all-video replay requirement, conditional HDR/codecs UNKNOWN and iOSD066 deferred. Earlier resolved G6 authority/deployment is not reopened.

## 2026-10-08 — D089 startup speed and acquisition attribution

UNKNOWN: a controlled exact-candidate speed improvement and which original acquisition/response hop dominates across videos. Actual old-production concept replays varied4.8–9.4seconds and were not matched cold controls; latest source-assignment5ms versus metadata4631ms suggests waiting, but native/probe requests were not correlated. Local guard correctness is verified; no percentage/average or historical45second-cause claim. Owner: `qa/video-startup/README.md`. Any later comparison must distinguish exact candidate/account/device and controlled state; this entry creates no unattended execution or deployment grant.

D090 delivery update (2026-10-08):1.23.4 exact operating actual PC clip reaches first frame6773ms/ready4/111frames/error0 and normal cleanup, while fresh library collects2051at scroll0. RELEASE-1.23.4.md resolves actual operating execution for this finite scope. Controlled speed gain/acquisition-hop attribution remainsUNKNOWN; deployment approval does not close it or create an unattended queue.

## 2026-10-08 — D091 local feature evidence boundary

LOCAL_DONE: rounded shadow clipping and temporary mobile hold2x are implemented and scoped local QA passes. UNKNOWN: new actual operating/account, physical Android/iOS and finger/OS-edge behavior. Owners: `qa/rounded-surface-clipping/README.md` and `qa/mobile-hold-speed/README.md`. D090 delivered the previous1.23.4 unit; no new D091 deployment authority is inferred. This entry records evidence limits and creates no unattended work or automatic rollout.

## 2026-10-08 — D092 photo-control evidence boundary

LOCAL_DONE: mobile photos and video→photo transitions contain no video-only paint/AX/Tab control, persistent feedback/menu state retires immediately, and native video recovery/hold2x pass in scoped local emulation. UNKNOWN: new actual operating/account/Drive acquisition, physical Android/iOS and finger/OS-edge behavior. Owner: qa/image-control-cleanup/README.md. No remaining local blocker or requested decision; this boundary creates no unattended device work or new deployment grant.

## 2026-10-08 — D093 delivery resolves D091/D092 operating boundary

RESOLVED for authorized operating delivery: D093 explicitly approves prepared D091/D092 and minimal loading;1.23.5 runtime5f38160/Worker7c761d33 deployed with exact public/config/ordinary account update and one native clip proof. No remaining delivery decision. Previous D091/D092 new-deployment authority and operating-execution unknowns are closed in this finite scope.

UNKNOWN remains: new physical Android/iOS/finger/OS-edge, sustained/all-format evidence and D089 controlled speed/acquisition attribution. RELEASE-1.23.5.md owns current proof; these limits create no unattended queue or automatic device work.

## 2026-10-19 — Q3 pipeline error-code allowlist omits Q1_SOURCE

UNKNOWN whether intended: media/video-q3-pipeline.mjs reports Q1_SOURCE_* read failures as Q3_PIPELINE_FAILED, while Q1/Q2 pipelines pass them through. D096 refactor preserved each allowlist exactly. Changing it alters user-visible error classification and the license-pinned Q3 product source (licenses/video-q3-source-manifest.json), so it needs an explicit decision and a re-packaged corresponding source.

## 2026-10-19 — video-q3-codec.mjs manifest hash differs from the Git blob

Observed during 1.23.9 delivery: licenses/video-q3-source-manifest.json pins media/video-q3-codec.mjs as sha256 32561bde… (13112 B, the Windows CRLF working-tree bytes), while the committed blob that materialize serves is 9f6f66f2… (13110 B, LF via .gitattributes eol=lf). Production now serves the Git blob, as 1.23.8 did. UNKNOWN which bytes the published corresponding source intends; resolving needs a decision (re-generate the manifest or pin the file -text) and must not be guessed.

Closed 2026-10-19 by D099 (1.23.10): Q3 Q1_SOURCE allowlist — Q3 now passes Q1_SOURCE/Q1_EXACT causes like Q1, source package regenerated; video-q3-codec manifest vs Git blob — file pinned -text, blob equals the manifest (32561bde…). qa/release-1.23.10 owns evidence.

## 2026-10-19 — D100 follow-ups (not decided)

UNKNOWN until deployed: the SW-side hinted acquisition (player next/previous, keyboard opens) was verified by unit tests and a page micro-benchmark only, not live. Proposal, not decided: moov-at-end files still pay two extra serial Drive range requests (~2 s); a bounded SW continuation of the cancelled head stream could save ~1 s but is a new transport path and needs its own decision. Owner: qa/video-startup-20261019/README.md.

## 2026-10-19 — D101 head continuation live behavior

UNKNOWN: whether actual Chrome signals the abandoned moov-at-end head to the SW (stream cancel or request.signal abort) before the ~32 KiB restart arrives. Without it the D101 park never forms (no harm, no saving). Expected saving ≈0.9–1.2 s per moov-at-end open is assumed, not measured. Resolve with an actual Chrome run of branch claude/q0-moov-continuation-20261019 watching `request-start` reason `continuation`. Owner: qa/q0-continuation-20261019/README.md. The D100 follow-up proposal above is now prototyped by D101; its release remains undecided.

Resolved 2026-10-19 (D101 cancel propagation): in actual Chrome 155 against a local Drive-like server (900 ms TTFB), the abandoned head reaches the SW before the restart; all 6 candidate opens served `bytes=65536-` from the continuation (3→2 requests, −0.93 s to 1 s of playback). Production Drive and other engines remain unmeasured; release remains undecided. qa/q0-continuation-20261019/local-chrome owns the receipts.

## 2026-10-20 — D102 follow-ups

Resolved: the D101 continuation works on production Drive (15/15 restarts on the 0.9 MB/15 MB moov-at-end files; qa/release-1.23.12). Proposal, not decided: large moov-at-end files (#6, 807 MB) restart at ~8 MB, beyond the 4 MiB window. Widening it trades memory and an unadopted-transfer cap. Observed, not decided: the user's ~/.gitconfig core.autocrlf=false (2026-10-19 22:53) breaks the materializer hash check unless overridden per command. Whether that setting is intentional is UNKNOWN.

## 2026-10-23 — D103 follow-ups

Not decided: release of D103 (1.23.13). UNKNOWN until measured on real devices: the first-visit gain from overlapping the credential request with the SW install, and the touch-device topbar paint saving (both reasoned, not measured). Observed, not fixed: a small dash artifact left of the card resolution badge in demo mode exists identically before and after D103 (pre-existing UI detail).

## 2026-10-23 — D104 delivery follow-ups

Observed, not decided: C:\DriveBackup\Projects-mirror\Drive-Original\source hard-links nearly every file of the checkout (not created by an agent session as far as recorded). It makes `npm run deploy:candidate` fail in place by design. Whether it is intentional and whether the deploy procedure should permanently use a clean worktree is UNKNOWN; CHECKPOINT Tried records the working procedure. The D103 follow-ups (first-visit credential overlap and touch topbar savings unmeasured; pre-existing card badge dash) remain open.

Resolved 2026-10-23 by D106: the user created the C:\DriveBackup\Projects-mirror hard-link mirror intentionally ("ㅇㅇ 내가 직접 만든게 맞아."). It stays untouched; `npm run deploy:release` (clean temporary worktree) is the standard deploy path, verified by a full dry run from bf22383.

## 2026-10-26 — D110/D111 follow-ups

Resolved by D112: D110 + D111 shipped as 1.23.16 (Worker 8c48f820, main a42d82c). Observed, not changed: `media/video-q3-input.mjs` treats the QuickTime 4-byte list terminator as `GENERAL_BOX_HEADER` too; it is license-pinned (licenses/video-q3-source-manifest.json), so fixing it needs a regenerated corresponding-source manifest. It affects only the Q3 software-decode route, not the "원본 형식 확인 필요" dialog. Assumed: QuickTime sound description v1/v2 parsing in the Q2 AC-3 streaming path is handled by the bundled demuxer (no actual v1 AC-3 file was available to test).

## 2026-10-26 — D113/D114 follow-ups

Observed (qa/release-1.23.17): the move index is 43,860 folders and takes ~150 s per session (460 per page); recent folders and server search make it optional for the common case, but browsing the full tree or middle-of-word search still waits for it. Not decided: persisting the index (IndexedDB) with background refresh, which D113 left out of scope. Not verified in production: a real move recording its target (unit/demo only).

Resolved 2026-10-26 by D115: persisting the move folder index is not wanted for now ("지금은 최근 폴더랑 검색으로 충분해. 목록 저장은 안 해도 돼."). Still not verified in production: a real move recording its target.

## 2026-10-26 — D116/D117 follow-ups

Not verified in production: a real successful background trash/move and the beforeunload prompt during a real job (unit/demo only; no user file was changed). Assumed: failure toasts and the 403 permission guide may now appear while the user is elsewhere in the app; no user feedback yet.

## 2026-10-26 — D118 follow-ups

Assumed (not asked): "확대 잠금" freezes the current view (pinch/pan off, swipes work) rather than carrying a zoom across files; zoom resets on every file change. Assumed: the photo viewer gets the same zoom as videos. Not verified on real devices: iPhone Safari and Android Chrome two-finger pinch (synthetic touches in the browser pane only), a real trackpad pinch, and the copy button with a real clipboard (the pane blocks clipboard writes; the button falls back to selecting the name). The demo video cannot play locally, so video zoom was checked by unit tests and photo-path browser checks.

## 2026-10-26 — D119 follow-ups

Assumed (not asked): a hand-picked subfolder set belongs to the folder it was made in (turns off when entering another folder, restored by back), while "모든 하위 폴더" follows navigation as before. Not verified with a real Drive account: the picker's folder-only Drive listing (shared drives, resource keys, >1000 subfolders) and the selective scan against real latency; checked by unit tests and the demo tree only. Not checked on a real phone: the custom dropdown and the picker sheet (emulated 390×844 touch only).

D120 (1.23.19 in production) narrows the D118/D119 rows: the picker's Drive folder listing and the selective scan were verified on the real account (추억/영상). Still not verified: physical-phone pinch, real trackpad pinch, mouse-drag pan and video zoom in production, real clipboard copy, shared drives and >1,000 subfolders in the picker.
