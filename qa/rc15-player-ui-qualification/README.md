# rc.15 current-player UI qualification — 2026-09-30

This is a bounded local synthetic-provider slice against unmodified current rc.15
app/SW/player bytes. It extends the earlier rc.12 synthetic-counter UI audit with
actual native/Q2 media decode and trusted input. It does not repeat or replace
that audit's four-viewport/cancel/multitouch/library coverage.

Run from source with `node qa/rc15-player-ui-qualification/qualification.cjs`.
The driver reuses the maintained native-retirement harness server/provider and
fixtures; build-driver.cjs plus ui-checks.txt regenerate qualification.cjs.
Chrome DevTools list_pages succeeded (about:blank). Installed isolated Chrome
headless contexts were used for serial owned QA to avoid sharing live/personal
browser state. Chrome 154.0.8037.58 was observed.

Final results.json/run.log now verifies the repaired rc.16 source6/6. The report
scope wording retains the rc.15 harness lineage; exact producer hashes below and
APP_VERSION1.22.0-rc.16 identify this execution. Failed rc.15 runs are preserved
under corrected-qa-product-loader-failure and specific baseline report names.
The six cases are: AC3/EAC3 Q2 and AAC Q0,
each at1280x800 desktop and390x844 touch emulation. Producer start/end include
app/SW/CSS/HTML and general/audio/mediabunny artifacts; hashes must remain equal.
Fixtures and harness/driver SHA256 are recorded. All provider requests are synthetic;
external non-provider requests are blocked. Product server bytes are unchanged.

Checks: non-hidden cursor; native44px lower reveal entry preserves playback;
central dismissal preserves playback; hidden central pause does not reveal chrome
(D-056); trusted Space resumes while chrome remains hidden; Tab reveals usable
controls;50/90% pointer/touch seek gets a decoded rVFC near the original target,
clears seek owner and loading; recovery close clears source/selection and settles
retirement; reopen presents frames, removes poster/loading and retains hidden chrome.
Initial routing state records poster/loading before source assignment; its hidden
video has zero bounds. Presented stage geometry is checked separately. Desktop and
touch screenshots were inspected; Q2 exposes original-video/lossy-audio status and
accessible seek/navigation controls without visible clipping in these two viewports.

Fallback/error scope is explicit UI injection through existing showDrivePreview
with userInitiated:false, modeling exhausted-original recovery. It verifies failed
state, zero retained source, no external preview document, independently visible
recovery and trusted close. It does not claim induced real transport failure,
Google preview playback or actual-account fallback.

Retained harness findings: immediate decoded-counter checks can precede poster
handoff; routing-entry geometry is zero while video is hidden; unawaited reset seek
can replace source after a successful old handoff; reopen also needs presented-frame
handoff. Those early harness failures are retained with their exact producer/driver
maps. pre-frame-refinement and pre-explicit-seek-frame reports retain narrower passes.
explicit-frame-timeout-results/log retains one AAC desktop paused90% callback timeout;
a fresh selected AAC case passed, but the next serial run also timed out in AAC
touch paused90%. callback-order-timeout-results/log preserves its settled time9s,
pausedtrue,seekingfalse,isSeekingfalse,watchdognull,loadingfalse with missing QA frame.
The lifecycle child independently captured a target frame arriving while seeking
was still true, followed by settled native state. This driver contained the same
QA defect: it discarded target frames unless seeking was already false in that
same callback. The final corrected driver retains exact decoded target proof then
joins later seekingfalse/isSeekingfalse/watchdognull/loaderhidden. It does not
weaken the target-time assertion or claim long-run reliability.

No product edits, physical Android/iOS, real-account, audibility, full-duration,
background-return, production, main/push, global settings or automation proof.
The lifetime50-cycle unit is separately owned and was not run here.

## Material product finding

After correcting the callback ordering QA defect, AC3 desktop then bounded AC3
touch both reproduced a persistent loading indicator after paused90% Q2 seek.
The touch diagnostic in ac3-touch-emulated-results.json captures target decoded
frame5.375,currentTime5.399999,pausedtrue,seekingfalse,isSeekingfalse,watchdognull,
readyState4,totalFrames4,isReadytrue,loadingtrue,presentationSession2/mediaSession2,
sourceGeneration8; Q2 generation4 is buffered-to-end with no failure.

app.js scheduleVideoFramePresentation currently keys pending presentation only
by mediaSession. If a source-generation rebuild occurs while a callback is queued,
the new schedule sees the old key and returns; the old callback rejects the new
generation before deleting its key. presentation-owner-regression.cjs extracts
the current function and deterministically proves this deadlock. The proposed
source/session/attempt composite key preserves stale callback rejection while
allowing the new generation to schedule and clear only its own loader. See
presentation-owner-results.json and proposed-presentation-owner.diff. Root authorized the minimal shared app.js patch after unchanged-source lifecycle
proof finished. The composite key is now implemented; root also updated version
metadata to rc.16. A maintained actual-function regression lives at
tests/player-presentation-owner.test.js and passes1/1. Final installed Chrome
six-case strict run passes6/6 with identical complete before/after producer maps.
All twelve50/90% seeks retain decoded target frames and finish with loadingfalse;
AC3/EAC3 frames3.0/5.375 and AAC5.0/9.0 remain within the unchanged0.25s tolerance.
All six recovery closes settle retirement and all six reopen handoffs pass.
No page errors occurred. Root owns integration, full suite, commit and delivery.
