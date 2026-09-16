# Goal — Commercial-grade player and library stability

## Goal

Bring Drive Original's mobile and desktop media-library experience to a commercially credible level across gesture navigation, playback controls, dialogs, authentication, streaming, thumbnails, bulk actions, performance, and latent-defect recovery.

## Definition of done

- Clear, axis-locked mobile gestures commit only after deliberate movement and recover cleanly from cancellation, multi-touch, rapid repetition, and reduced-motion mode.
- Desktop playback controls are compact, coherent, keyboard-accessible, frame-steppable, and unobtrusive during viewing.
- Media uses Range-based progressive playback first, preserves byte ranges across authentication recovery, cancels stale work, and only uses whole-file original recovery through writable OPFS or tightly bounded memory after transport retry fails.
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

## Historical done check — v1.16.0

Satisfied. Evidence: 40/40 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 mobile demo interaction; deliberate/sub-threshold and committed synthetic four-direction touch scenarios; prior local Lighthouse 100/100/100/100 and LCP 318ms/CLS 0.00 baseline; successful Pages run `35085992727`; five live core assets byte-equal to release commit `6a669fb`; matching 114,471-byte release ZIPs; and re-fetched Notion maintenance data with both packages attached. Real-account Google behavior and physical iOS Safari remain explicit verification boundaries, not locally proven facts.

## Done check — v1.17.0

Satisfied. Evidence: 52/52 Node tests; `node --check` for app and worker; `git diff --check`; independent main-diff review with no P1/P2/P3 findings; two-round zero-context rehearsal with the first round's label findings fixed and the second round clean; desktop and 390×844 mobile demo readback with no console warnings/errors or horizontal overflow; mobile local LCP 414ms, CLS 0.00, and Lighthouse 100/100/100/100; successful Pages run `35095971626`; five live core assets byte-equal to release commit `f53cde6`; matching 119,318-byte release ZIPs with every file equal to its Git blob; and re-fetched Notion maintenance data with both packages attached. Authenticated Drive playback and physical iOS Safari remain explicit verification boundaries, not locally proven facts.
