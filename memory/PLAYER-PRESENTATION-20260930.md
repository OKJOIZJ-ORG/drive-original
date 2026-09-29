# Source-owned frame presentation — 2026-09-30

Observed defect: a paused Q2 seek reached the requested decoded frame and settled
its native/app seek, but the loading indicator remained visible. Both desktop and
touch-emulated AC3 reproduced the failure on fixed rc.15. The actual designated
TS/Q1 source later showed the same loading residue after its 50% paused seek;
that actual run remains a separate rc.15 observation.

`scheduleVideoFramePresentation` coalesced callbacks using only `mediaSession`.
A source rebuild in the same session inherited the earlier pending key. The new
schedule returned early and the stale callback rejected the changed source before
removing its key. The rc.16 key now includes session, source attempt and source
generation. A stale source still cannot dismiss current loading, while the current
source can register and complete its own decoded-frame handoff.

The maintained `tests/player-presentation-owner.test.js` executes the actual
extracted function and checks coalescing, replacement, stale rejection and current
handoff. Focused 1/1 and complete current Node 558/558 pass. The initial root
JS-only selection passed 420/420; it omitted MJS suites and is explicitly retained
as `js-suites-only.log`, not the full product check. The complete explicit producer
and stable hashes are in `qa/candidate-rc16-delivery/product-tests.json`.

Current synthetic-provider native Chrome passes 6/6: AC3/EAC3 Q2 and AAC Q0,
each at desktop1280×800 and touch-emulated390×844. Twelve paused50/90% seeks
retain actual target-frame evidence and join eventual seek/loader settlement in
either event order. D-056 control reveal/pause, keyboard, recovery close and
reopen pass; page errors zero and producer hashes remain identical before/after.
See `qa/rc15-player-ui-qualification/final-summary.json` and its retained failures.

The QA-only ordering defect was independently reproduced: a paused target frame
can arrive while native `seeking` is still true. Requiring both in the same callback
discarded valid evidence. The corrected harness joins those observations without
weakening the target tolerance. That QA fix does not replace the product defect.

Scope: local rc.16 implementation and bounded synthetic native UI proof. Actual
rc.16 candidate replay, full format/device acceptance and native-memory plateau
are still open. rc.15 lifecycle50/150 and72s evidence stay bound to ee0ac84;
they are not relabeled as rc.16 runtime proof. Production, main/push, original
files, grants, volume/output and automation were not changed.
