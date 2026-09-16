# Goal — Commercial-grade player and library stability

## Goal

Bring Drive Original's mobile and desktop media-library experience to a commercially credible level across gesture navigation, playback controls, dialogs, authentication, streaming, thumbnails, bulk actions, performance, and latent-defect recovery.

## Definition of done

- Clear, axis-locked mobile gestures commit only after deliberate movement and recover cleanly from cancellation, multi-touch, rapid repetition, and reduced-motion mode.
- Desktop playback controls are compact, coherent, keyboard-accessible, frame-steppable, and unobtrusive during viewing.
- Media uses Range-based progressive playback, preserves byte ranges across authentication recovery, cancels stale work, and never downloads an entire video as an automatic fallback.
- Google authentication has one request coordinator, stale-response protection, a user-action recovery path, and request-scoped service-worker token/error handling.
- Long press enters multi-select on touch; desktop has an explicit selection affordance; bulk delete and folder move are safe, count-aware, and reconcile partial failures.
- Thumbnail work is bounded, cancellable, deduplicated, viewport-aware, and measured against the existing 240-card virtual window; media startup must not spend bytes on speculative bodies that cannot be reused.
- Dialogs and default UI have consistent hierarchy, focus behavior, touch targets, loading/empty/error states, and reduced-motion behavior.
- Targeted automated tests, browser scenarios at mobile and desktop sizes, static checks, and a fresh-tree release comparison all pass before deployment.

## Mobilization

- **confirmed:** D-001 through D-031 define the standing product contracts; D-031 makes the user's list a minimum, not a ceiling.
- **confirmed:** v1.14.1 on `main` is the clean baseline; work is isolated on `codex/commercial-grade-stability`.
- **observed:** baseline `node --test tests/app.test.js tests/static.test.js` passes 15/15.
- **observed:** the service worker does not classify upstream media errors, while the app listens for a message that is never sent.
- **observed:** media prefetch concurrency is released at response headers and does not bound active response bodies.
- **observed:** OAuth refresh has three competing entry paths and no shared in-flight promise.
- **observed:** video playback failure can trigger full-file Blob buffering.
- **observed:** mobile swipe commits at 45px or 0.15px/ms without a dominance ratio or touch-cancel path.
- **unknown:** real-account Google playback behavior, mobile Safari behavior, and multi-thousand-item performance after the new changes require browser/device verification.

## Terrain

- `app.js`: application state, Drive API/auth, virtualized cards, thumbnails, player, gestures, bulk mutations.
- `sw.js`: authenticated Range proxy, token exchange, upstream error mapping, cancellation.
- `index.html`: player, dialogs, bulk-action surfaces and accessible names.
- `styles.css`: responsive player controls, cards, selection state, dialogs, reduced motion.
- `tests/app.test.js`, `tests/static.test.js`: deterministic state/DOM contracts and regression coverage.

## Build order

1. Authentication, request generations, service-worker Range/error recovery, cancellation, and removal of video Blob fallback.
2. Gesture state machine, transition cancellation, playback readiness, frame stepping, PC control consolidation.
3. Multi-select state, long-press/pointer interactions, bulk delete/move with partial-failure reporting.
4. Thumbnail/prefetch scheduler, rendering priority, dialog/default-UI polish, accessibility.
5. Automated regression tests, desktop/mobile browser scenarios, performance/network inspection, independent review.
6. Version/docs/product truth, commit, merge to `main`, push, GitHub Pages byte verification, ZIP and Notion maintenance record.

## Done check

Satisfied. Evidence: 35/35 Node tests; `node --check` for app and worker; `git diff --check`; desktop and 390×844 mobile demo interaction; deliberate/sub-threshold synthetic touch scenarios; no browser console warnings or errors; mobile Lighthouse 100/100/100/100; local unthrottled LCP 318ms and CLS 0.00; successful Pages run `35077604373`; five live core assets byte-equal to release commit `b813a15`; matching release ZIPs; and re-fetched Notion maintenance data. Real-account Google behavior and physical iOS Safari remain explicit verification boundaries, not locally proven facts.
