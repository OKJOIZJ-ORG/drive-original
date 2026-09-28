# OPEN QUESTIONS — registered, not remembered

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

## Readings in force — assumed, not decided

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
