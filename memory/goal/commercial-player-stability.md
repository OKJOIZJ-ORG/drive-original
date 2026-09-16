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
- **confirmed:** v1.15.0 on `main` is the clean baseline; follow-up work is isolated on `codex/in-app-playback-recovery`.
- **observed:** baseline `node --test tests/app.test.js tests/static.test.js` passes 15/15.
- **observed:** the service worker does not classify upstream media errors, while the app listens for a message that is never sent.
- **observed:** media prefetch concurrency is released at response headers and does not bound active response bodies.
- **observed:** OAuth refresh has three competing entry paths and no shared in-flight promise.
- **historical baseline:** video playback failure could trigger uncontrolled full-file Blob buffering. The current implementation replaces that with writable-OPFS detection and bounded-memory policy.
- **observed:** mobile swipe commits at 45px or 0.15px/ms without a dominance ratio or touch-cancel path.
- **unknown:** real-account Google playback behavior, mobile Safari behavior, and multi-thousand-item performance after the new changes require browser/device verification.

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

## Done check

Satisfied. Evidence: 35/35 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 mobile demo interaction; deliberate/sub-threshold synthetic touch scenarios; no browser console warnings or errors; mobile Lighthouse 100/100/100/100; local unthrottled LCP 318ms and CLS 0.00; successful Pages run `35077604373`; five live core assets byte-equal to release commit `b813a15`; matching release ZIPs; and re-fetched Notion maintenance data. Real-account Google behavior and physical iOS Safari remain explicit verification boundaries, not locally proven facts.
