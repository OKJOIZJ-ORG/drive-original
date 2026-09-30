# Paused seek presentation handoff — prepared and integrated 2026-09-30

Root supplied actual rc16 TS evidence: paused50% target804.704 frame804.688 arrived
while seeking was true; later seeked/watchdog settled and readyState4,pausedtrue,
posterfalse,isReadytrue but loading remained true with current generation8 key.
Space resumed the same source/seek and a subsequent frame cleared loading. This
leaf does not contain or publish private account/corpus evidence; root owns it.

Current code reproduced this ordering deterministically using actual app functions
and existing test VM/fake clock. baseline.log retains the positive ordering failure.
The initial proposal insertion used an overly broad seek-frame text anchor and
was corrected before product integration; initial-proposal-anchor-failure.log is
retained. Corrected proposed-app.js passes3/3 (proposal.log), after which root GO
allowed the shared source fix. No browser was launched by this child.

app.js now keeps one completed current decoded seek owner only after the existing
seeked+targetframe+settled validation. Common completeVideoFramePresentation owns
the old poster/is-ready/loading/error handoff and checks file/media/playback,
source/seek/attempt plus account ID, authAccountKey and Drive-session generation. Normal scheduled presentation
uses that same helper after its pending-key fence. A late ready path can reuse the
completed proof only while currentTime still matches the accepted target and all
identity fences pass. It never substitutes readyState,counters,currentTime alone
or pause for target-frame proof. The owner is cleared by clearMediaSeekWatchdog,
which new seek/source/retirement/reset paths already use; stale reuse also releases
its record. Canonical account invalidation also clears the retained proof immediately.

Maintained tests/app.test.js adds three ordering/fence cases: target while seeking
cannot dismiss loading until seeked; after completion late showMediaLoading plus
onMediaReady reuses the proof without another paused callback; paint-only/stale
frames, replacement account/attempt/source and retirement cannot hide a loader.
The existing tests/player-presentation-owner.test.js extraction now includes the
shared helper. Historical focused10/10 is retained in focused-before-seeked-gate.log and
results-before-seeked-gate.json; no historical record is repinned. Independent
review then reproduced ordinary presentation callback revealing before seeked.
ordinary-before-seeked-baseline.log proves this branch. The common handoff now
waits while a current owned seek, app isSeeking or native seeking is active, without
discarding the current pending key. A maintained actual-function regression runs
sampler and ordinary callback in both orders before seeked and confirms subsequent
settlement uses the same frame. focused-final-lf.log/results.json now bind final
canonicalLF rc17 producers before/after to11/11 focused checks; prior focused.log
is the pre-normalization11 record. Root complete562/562 binds integration. Root owns rc17 metadata, full suite, candidate/live TS proof and
integration commit. WebP product patch remains held and was not applied here.

Files: app.js,tests/app.test.js,tests/player-presentation-owner.test.js plus this
new QA leaf. No version/docs/global config/account/media/production/main/push or
automation edits by this child. The retained proposed-app.js is a reproducible
source snapshot for the fake-context proposal test, not a public release artifact.
