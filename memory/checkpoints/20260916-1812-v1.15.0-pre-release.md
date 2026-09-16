# Checkpoint — v1.15.0 commercial-grade stabilization, pre-release — 2026-09-16 17:58

## The story so far

Drive Original v1.15.0 is implemented on `codex/commercial-grade-stability`. Deliberate axis-locked swipes, cancellable transitions, compact desktop controls, frame stepping, long-press/right-click multi-select, partial-failure-safe bulk move/delete, bounded thumbnail work, request-scoped Google token recovery, and Range-preserving service-worker retries are in place. Video no longer falls back to full-file Blob buffering, and Drive recovery opens a top-level view URL with its resource key. Non-reusable 512KB speculative media downloads were removed; connection preconnects remain. Automated tests pass 35/35; mobile demo Lighthouse scores 100 in every reported category, with LCP 318ms and CLS 0.00 in the local unthrottled trace.

## Decided

- D-031 remains the governing product decision.
- The service worker owns per-client token scope and preserves the exact Range/resource-key request across one 401 refresh retry.
- A failed video Range path stops safely and offers a top-level Drive handoff; only images may use the bounded full-file memory fallback.
- UI verification distinguishes Chrome mobile emulation from physical iOS Safari, and local demo mode from an authenticated Google account.

## Waiting on the user

- None.

## Next first action

Complete the independent final diff review, commit the verified unit, fast-forward `main`, push, verify GitHub Pages bytes against the release commit, package the ZIPs, and update the maintenance record.

## Tried

- Chrome mobile emulation found three genuine accessibility issues: zoom was disabled, metadata contrast was 2.48:1, and custom accessible names omitted visible labels. After correction, Lighthouse accessibility improved from 91 to 100.
- An authentication regression test exposed a same-tick `clearToken()` race; clearing the old single-flight reference fixed it and the new test passes.
- Browser screenshot file export to a new local artifacts path was denied by the browser tool; inline screenshots and DOM/computed-style readback completed the visual check.
