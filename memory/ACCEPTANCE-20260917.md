# v1.20.0 acceptance follow-up — 2026-09-17

## Status and source identity

- **observed:** GitHub `main` and the original clean Windows checkout were at `70ff332ac6ff5fd3b65cf2d101a33d86645269ae`. This is the release-evidence commit; its runtime matches implementation commit `5faf6ba5320946592928225e3aeb585db1c14e18`.
- **observed:** the public-only `gh-pages` branch was at `c907530694b98d0d1e28dab7d7935bb28d2ffa74`. This session does not replace the deployed release or its historical verification record.
- **implemented candidate:** work is isolated on `codex/acceptance-v1.20.0-20260917`, prepared as v1.20.1 so a future release changes the service-worker and HTML cache versions together. No new runtime dependencies, OAuth scopes, backend, workflow permissions or user-media mutations are introduced.
- **OPEN:** physical iPhone Safari/PWA acceptance and authenticated propagation across two actual devices. Automated evidence below is not a substitute for either gate.

## Reproduced failures and repairs

### A. Two clients remain stale while both are continuously visible

**observed baseline:** the original 120 Node tests pass. Its simultaneous-write test verifies the union of saved writer documents, not both running clients' final state. The new two-client regression fails because no periodic remote read is scheduled.

**observed browser reproduction:** `qa/acceptance-audit.cjs` executes the unchanged baseline from the original checkout. Two isolated Chromium contexts have separate local storage, synthetic OAuth sessions for one shared fixture account, and a barrier forcing both writes to read the same prior catalog. Each context favorites and opens a different image through the UI. After the 22-second convergence deadline, A still knows only A's favorite/viewed entry and B only B's entry. Both writer documents exist and preserve the edits; the missing behavior is delivery to the open clients, not remote data loss.

**implemented:** one visibility/online/account-scoped refresh timer reads remote state about every 15 seconds after a completed refresh, with no overlapping scheduled read or write. A resume/pageshow/reconnect requests an immediate refresh subject to server cooldown. Hidden/offline/pagehide/token-clear states stop scheduling, and verified token renewal restarts it. Transient errors back off; permission failures stop automatic polling; 403 quota failures remain retryable. Account-generation and timer-identity guards reject old work. Unchanged documents reuse the existing modified-time cache.

Received changes update heart controls and reconcile the currently visible favorites list without resetting its window. Favorite membership changes invalidate retained history snapshots. An unlike received during metadata loading cannot reinsert the removed card. Writer-owned files, the legacy read-only merge, viewed monotonicity, latest-item timestamps and equal-time unlike precedence remain unchanged.

**trade-off:** this is eventual polling, not instantaneous push. Each ordinary successful cycle reads account identity and the writer catalog, plus changed documents; it runs only for visible, online, authenticated contexts. Multiple visible tabs can each read. This bounded traffic preserves the existing serverless architecture without inventing a backend or claiming a Google latency guarantee.

### B. Cancelled edge completion can still run

**observed baseline:** fulfilling `Animation.finished`, cancelling the gesture before the queued promise callback executes, then draining microtasks causes one back action instead of zero. Cancelling an already-fulfilled promise's animation cannot undo its queued callback.

**implemented:** a transition-specific identity is invalidated before cancelling animations/timers. Completion must still own that identity as well as the navigation generation. An old callback cannot navigate, clear a newer transition or consume its timer.

### C. Promise and deadline can complete one gesture twice

**observed baseline:** when the finished promise and fallback deadline are both ready, the new test observes two calls to the navigation commit path. Existing history-pending guards sometimes mask this, but do not provide a per-animation once-only contract.

**implemented:** consuming the transition identity precedes the first commit. Every subsequent callback becomes a no-op, including the reduced-motion and fallback paths.

## Automated evidence

The first three new regressions were run before runtime changes: **0 passed / 3 failed**. The new browser reproduction independently fails on unmodified `70ff332` with both documents saved but both clients stale. The original 120-test suite was rerun and passed before implementation.

**Observed candidate results:** 131/131 Node tests; eight existing functional groups; eight edge groups after the edge fix (subsequent changes concerned auth/rate-limit guards and version metadata). In the v1.20.1 browser run, independent clients converged in 15,066 ms, remote unlike removed the peer's visible card in 15,046 ms, and reload retained the writer identity and tombstones. These timings are synthetic-endpoint observations, not Google latency measurements.

**Offline evidence correction:** the first browser driver allowed `route.fulfill` to answer an API request even while the context reported offline. Its reported offline replay pass is withdrawn as proof. The driver now explicitly aborts offline upstream requests and asserts that the remote store and peer state remain unchanged before reconnection. The execution tool blocked the stricter rerun, so that check remains **UNVERIFIED (A-003)**; the corrected driver's syntax was checked. This does not invalidate the independently observed continuously-visible convergence, remote unlike, or reload cases. The final review must not count four verified acceptance-browser groups.

The candidate's dated final results, source hashes and evidence classification are recorded in `qa/acceptance-results.json`. Reproduction commands:

```sh
node --test tests/*.test.js
node qa/acceptance-audit.cjs
node qa/edge-audit.cjs
node qa/functional-audit.cjs
```

Install the pinned development dependencies under `qa/` as described in `qa/README.md`. For baseline comparison, set `ACCEPTANCE_ROOT` to a clean checkout of `70ff332`, then run the new acceptance driver from the candidate checkout. Do not copy production cookies or bearer tokens into this fixture. Raw failed/successful outputs and screenshots are retained in ignored `qa/acceptance-*/`, `qa/edge-final/` and `qa/functional-acceptance/` folders. None are in the public Pages allowlist.

## Physical iPhone gate — OPEN

**observed access limitation:** the Desktop connector returned `Tool observe not found`; local device enumeration found no connected iPhone/iPad; no existing browser remote-debugging endpoint was found. A directory search for physical iPhone testing services did not return a suitable connected provider. No actual touch gesture was performed on an iPhone in this session.

Use a real iPhone, separately in Safari browser mode and a home-screen installation. First record iPhone model, iOS/Safari version, orientation, Reduce Motion setting, installed app version and exact tested source commit. Do not claim the candidate was tested while production still serves v1.20.0; deploy it deliberately through the existing release command and verify the served bytes first.

| Case | Required observation |
|---|---|
| Root → folder A → folder B; physical left-edge drag right and release | One navigation, B → A. No duplicate back to root, app exit, stuck overlay or later delayed jump. |
| Same path; short drag / deliberate reverse / second finger / interruption | The intended cancellation stays on B after all completion callbacks have settled. |
| Parent scrolled down, nested route, then back | Previous folder, actual filter, search/sort and scroll restore. Repeat rapidly through several nested routes. |
| `video` → `favorites` → back | Restores `video`, not hardcoded `all`; the next gesture consumes only the next actual history entry. |
| Safari physical edge versus 20–32 px inset; standalone physical edge | Safari's system edge animation is not competed with; custom/PWA animation tracks directly and commits once. |
| Vertical scroll, open dialog/player, landscape and Reduce Motion | No unintended library navigation, clipped/stuck layer or inaccessible controls. |

Capture screen recordings with visible before/after route, the initiating touch when possible, and enough post-release time to detect delayed navigation. A synthetic touch event, `history.back()` call or Windows WebKit screenshot cannot close this gate. Record PASS/FAIL per row and attach the evidence to the review; enter any reproducible failure with exact steps, environment and source SHA.

## Two actual devices / Google account gate — OPEN

**unknown:** real OAuth consent and real appDataFolder propagation on two independently authenticated devices for this candidate. The fixtures never contact Google for account state. Another connector's OAuth session/app-data folder is not equivalent to this application's own client.

Use two physical devices with independent browser storage, the same Google account and the same verified candidate release. Confirm matching account identity locally without publishing permission IDs, email addresses, access tokens, cookies or private media names. Use two small throwaway images A and B already available to the account; do not trash/move existing media, reset app data or revoke account access as part of the test.

| Case | Required observation |
|---|---|
| Both apps stay in the foreground; like/open A on device 1 and B on device 2 nearly simultaneously | Both clients acquire both likes and viewed entries without switching tabs, reloading or manually refreshing. Save operation/observation timestamps for each direction. |
| Both show favorites; unlike A on device 1, then unlike B on device 2 | The other device removes the correct card automatically. An unchanged list does not repeatedly jump to its first window. |
| Same-item opposite actions from stale clients | Both converge to the same result; latest stored item timestamp wins, with unlike winning an exact tie. Record clock differences rather than assuming wall clocks are equal. |
| Device 2 offline; change a favorite; reconnect | Local change survives, reaches device 1, and stays correct after reload. Capture any permission/rate-limit message instead of calling a timeout a pass. |
| Background/resume and token renewal/reconnect | Polling resumes and account identity stays isolated; no previous account's entries appear after an intentional account change. |

A **proposed healthy-network acceptance target** is receipt within 30 seconds once an ordinary writer upload succeeds, with the other app continuously visible and no reported cooldown/error. The implemented nominal read interval is 15 seconds; 30 seconds is a test target, not a promised Google service bound. A timing miss needs its observed conditions recorded. Uploaded/synced status on one device alone is not receipt evidence from the other. Preserve the viewed state as well as the visible hearts; use a local inspector for the timestamp check when available, redacting identifiers before attaching evidence.

## Completion rule

Keep the two physical gates OPEN until their environment, exact tested source, observations and evidence are recorded. Passing fixtures or shipping the fix does not close them. The original release record stays historical; this document owns the follow-up acceptance status.
