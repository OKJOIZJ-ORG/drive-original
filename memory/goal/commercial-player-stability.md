# Goal — Commercial-grade player and library stability

## Goal

Bring Drive Original's mobile and desktop media-library experience to a commercially credible level across gesture navigation, playback controls, dialogs, authentication, streaming, thumbnails, bulk actions, performance, and latent-defect recovery.

## Definition of done

- Clear, axis-locked mobile gestures commit only after deliberate movement and recover cleanly from cancellation, multi-touch, rapid repetition, and reduced-motion mode.
- Desktop playback controls are compact, coherent, keyboard-accessible, frame-steppable, and unobtrusive during viewing.
- Media selects one original-byte route without duplicate transfer: safely bounded videos use writable OPFS first, while large/unknown/unsupported cases use Range-based progressive playback; authentication recovery preserves the active route and stale work is cancelled.
- Vertical random playback has a complete-population spatial deck with two assigned neighbours above and below; horizontal playback preserves its session order; one decoder is reused across transitions.
- Google authentication has one request coordinator, stale-response protection, a user-action recovery path, and request-scoped service-worker token/error handling.
- Long press enters multi-select on touch; desktop has an explicit selection affordance; bulk delete and folder move are safe, count-aware, and reconcile partial failures.
- Thumbnail work is bounded, cancellable, deduplicated, viewport-aware, and measured against the existing 240-card virtual window; media startup must not spend bytes on speculative bodies that cannot be reused.
- Dialogs and default UI have consistent hierarchy, focus behavior, touch targets, loading/empty/error states, and reduced-motion behavior.
- Targeted automated tests, browser scenarios at mobile and desktop sizes, static checks, and a fresh-tree release comparison all pass before deployment.

## Mobilization

- **confirmed:** D-001 through D-034 define the standing product contracts; D-033 and D-034 add the original-quality recovery ladder and spatial shorts deck.
- **historical baseline:** v1.15.0 was the clean starting point; v1.16.0 is now released from `6a669fba4441e53b478dc272989c49155ac6803b`.
- **historical baseline:** `node --test tests/app.test.js tests/static.test.js` passed 15/15 before the stabilization work; the released suite now passes 40/40.
- **historical gap, resolved:** the service worker did not classify upstream media errors while the app listened for a message that was never sent.
- **historical gap, resolved:** media prefetch concurrency was released at response headers and did not bound active response bodies; the non-reusable body prefetch was removed.
- **historical gap, resolved:** OAuth refresh had three competing entry paths and no shared in-flight promise.
- **historical baseline:** video playback failure could trigger uncontrolled full-file Blob buffering. The current implementation replaces that with writable-OPFS detection and bounded-memory policy.
- **historical gap, resolved:** mobile swipe committed at 45px or 0.15px/ms without a dominance ratio or touch-cancel path.
- **unknown:** real-account Google playback behavior, mobile Safari behavior, and multi-thousand-item performance after the new changes require browser/device verification.
- **confirmed 2026-09-16:** D-035 tightens the original-quality ladder: only after all viable original-byte paths are exhausted may the app automatically enter the in-app Google compatibility player; authentication recovery remains in-app and external Drive navigation remains manual.
- **observed 2026-09-16:** v1.16.0 still routes a second 5xx, generic proxy errors, and some ambiguous media failures to compatibility preview before the complete original recovery ladder is exhausted. Range `200`/`206` integrity and `416` are not yet explicit app states.

## Terrain

- `app.js`: application state, Drive API/auth, virtualized cards, thumbnails, player, gestures, bulk mutations.
- `sw.js`: authenticated Range proxy, token exchange, upstream error mapping, cancellation.
- `index.html`: player, dialogs, bulk-action surfaces and accessible names.
- `styles.css`: responsive player controls, cards, selection state, dialogs, reduced motion.
- `tests/app.test.js`, `tests/static.test.js`: deterministic state/DOM contracts and regression coverage.

## Build order

1. Authentication, request generations, service-worker Range/error recovery, cancellation, and a policy-controlled OPFS/memory original fallback.
2. Gesture state machine, transition cancellation, playback readiness, frame stepping, PC control consolidation.
3. Multi-select state, long-press/pointer interactions, bulk delete/move with partial-failure reporting.
4. Thumbnail/prefetch scheduler, rendering priority, dialog/default-UI polish, accessibility.
5. Automated regression tests, desktop/mobile browser scenarios, performance/network inspection, independent review.
6. Version/docs/product truth, commit, merge to `main`, push, GitHub Pages byte verification, ZIP and Notion maintenance record.

## Current extension — v1.17.0 original-quality hardening

1. `named-unfilled`: centralize playback modes and failure causes so every automatic transition is deterministic. Lead: D-033/D-035 and `app.js`.
2. `named-unfilled`: validate upstream Range semantics and carry request/session evidence from `sw.js` to the active player.
3. `named-unfilled`: stream complete originals to writable OPFS, enforce bounded-memory limits, and clean every stale artifact.
4. `named-unfilled`: make quality labels evidence-based and give active playback priority over background media work.
5. `named-unfilled`: add deterministic fault coverage, authenticated browser evidence where available, independent diff review, and the standing release/Pages/Notion proof.

## Current extension — v1.18.0 authentication, thumbnails, and player polish

1. `satisfied`: ship the user-supplied OAuth client ID as the effective default while preserving a self-host override and never opening a login popup without a user gesture.
2. `satisfied`: render bounded-concurrency, non-animating GIF card frames with a static placeholder only on failure; restore the user-confirmed historical blue-dot icon asset across every icon surface.
3. `satisfied`: implement D-039's size- and capability-gated OPFS-first video route with a non-parallel Range fallback, exact cleanup, and evidence-backed quality labels.
4. `satisfied`: freeze swipe targets at axis lock, align commit thresholds, retain the outgoing/neighbor visual until the first new frame is presented, and hide both mobile overlay edges on idle.
5. `satisfied`: reduce desktop playback chrome to one status hierarchy and one compact control rail, move destructive/detail actions behind disclosure, and keep frame stepping visible only while paused.
6. `satisfied`: extend automated, desktop/mobile browser, authenticated-Drive-where-available, packaging, Pages byte, and maintenance-record verification before release.

## Historical done check — v1.16.0

Satisfied. Evidence: 40/40 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 mobile demo interaction; deliberate/sub-threshold and committed synthetic four-direction touch scenarios; prior local Lighthouse 100/100/100/100 and LCP 318ms/CLS 0.00 baseline; successful Pages run `35085992727`; five live core assets byte-equal to release commit `6a669fb`; matching 114,471-byte release ZIPs; and re-fetched Notion maintenance data with both packages attached. Real-account Google behavior and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Done check — v1.17.0

Satisfied. Evidence: 52/52 Node tests; `node --check` for app and worker; `git diff --check`; independent main-diff review with no P1/P2/P3 findings; two-round zero-context rehearsal with the first round's label findings fixed and the second round clean; desktop and 390×844 mobile demo readback with no console warnings/errors or horizontal overflow; mobile local LCP 414ms, CLS 0.00, and Lighthouse 100/100/100/100; successful Pages run `35095971626`; five live core assets byte-equal to release commit `f53cde6`; matching 119,318-byte release ZIPs with every file equal to its Git blob; and re-fetched Notion maintenance data with both packages attached. Authenticated Drive playback and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Done check — v1.18.0

Satisfied. Evidence: 64/64 Node tests; `node --check` for app and worker; `git diff --check`; independent full-diff review with no P1/P2/P3 findings; desktop and 390×844 browser readback with v1.18.0 assets, no console warnings, and no horizontal overflow; mobile synchronized idle chrome and expanded-tray timing; actual 1.78MiB GIF and local MP4 frame-handoff trials; successful Pages run `35107815036`; five live core assets byte-equal to release commit `cf31107`; matching 101,876-byte release ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Authenticated Drive playback, the deployment origin's Google OAuth registration, and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Current extension — v1.18.1 authenticated Range recovery

1. `satisfied`: distinguish a genuinely invalid 206 from a valid Drive 206 whose `Content-Range` is hidden by CORS.
2. `satisfied`: reconstruct only exact, known-size/`Content-Length`-proven intervals and keep every ambiguous response fail-closed.
3. `satisfied`: cover the app-to-worker size contract and bounded/open/suffix/EOF/HEAD/error edges deterministically.
4. `satisfied`: deploy and replay real large Drive files without whole-file confirmation or compatibility downgrade.

## Done check — v1.18.1

Satisfied. Evidence: 68/68 Node tests; `node --check` for app and worker; `git diff --check`; independent Sol review with no remaining P1/P2/P3; successful Pages run `35110287933`; five live core assets byte-equal to release commit `cac0d06`; authenticated 207MB and 1.01GB original Range playback with reconstructed, satisfied 206 evidence and no compatibility downgrade; no v1.18.1 console warnings/errors; matching 102,418-byte ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Physical iPhone Safari remains an explicit device-specific verification boundary.

## Current extension — v1.19.0 account media state and favorites

1. `satisfied`: persist viewed timestamps and favorite tombstones in one private Drive app-data document with an account-keyed local cache and deterministic merge semantics.
2. `satisfied`: prefer unseen media before watched media in the complete-population vertical random deck.
3. `satisfied`: add coherent card, desktop-player, mobile-player, and double-tap favorite controls plus an all-folder favorites projection.
4. `satisfied`: add mobile left-edge library back navigation, repair first-level folder back, and remove stale video play controls from image/GIF presentation.
5. `satisfied`: complete tests, responsive browser QA, Pages byte proof, Git-blob-identical packages, and Notion readback.

## Done check — v1.19.0

Satisfied. Evidence: 78/78 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 demo interaction with cross-folder favorite/unfavorite and zero console warnings/errors; deterministic double-tap, edge-swipe, account merge/upload, unseen-deck, GIF-control, and favorites tests; successful Pages run `35116311314`; five live core assets byte-equal to release commit `51e5a28`; matching 110,591-byte ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Actual two-device propagation and physical iPhone Safari touch gestures remain explicit verification boundaries, not locally proven facts.

## Current extension — v1.19.1 favorites and UI hardening

1. `satisfied`: request the explicit Drive app-data OAuth scope, migrate away from legacy scope tokens once, and retry only transient state-write failures within a bounded budget.
2. `satisfied`: remove the whole-Drive scan dependency from favorites by resolving cached media first and querying only missing liked file IDs, with partial-failure preservation and stale-request cancellation.
3. `satisfied`: centralize library status ownership so old errors cannot survive or reappear after changing a filter, folder, or request generation.
4. `satisfied`: rebalance the mobile four-filter row, stack overflow actions vertically above `⋯`, reduce double-tap feedback to an icon-only heart, and remove the duplicate root breadcrumb discovered during full UI QA.
5. `satisfied locally`: pass the complete 84-test suite three consecutive times, JavaScript syntax checks, diff check, 390×844 mobile interaction/geometry, 1280×800 desktop readback, and zero browser warnings/errors.
6. `satisfied`: commit, publish to `main`, prove Pages bytes, rebuild Git-blob-identical ZIPs, and update/re-fetch the maintenance record.

## Done check — v1.19.1

Satisfied. Evidence: 84/84 Node tests passing three consecutive full runs; `node --check` for app and worker; `git diff --check`; 390×844 mobile and 1280×800 desktop demo geometry/interaction with zero console warnings/errors; deterministic OAuth scope migration, direct favorite lookup, partial-result preservation, stale-status ownership, breadcrumb, GIF, double-tap, and edge-swipe coverage; successful Pages run `35121272050`; five live core assets byte-equal to release commit `c43b218`; matching 112,769-byte release ZIPs with all 15 files equal to Git blobs; and re-fetched Notion maintenance data with both packages attached. Actual two-device propagation, production-account OAuth reconsent/direct lookup, and physical iPhone Safari remain explicit verification boundaries.
