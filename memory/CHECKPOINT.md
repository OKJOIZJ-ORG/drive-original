# Checkpoint — v1.19.0 ready for release — 2026-09-17 00:33

## The story so far

Drive Original v1.19.0 is implemented on `codex/likes-and-navigation`. It includes the GIF play-control fix, account-synced viewed/favorite state, unseen-first shorts, desktop/mobile favorite controls, a cross-folder favorites view, mobile double-tap favorite toggle, and a left-edge library back gesture. Desktop and 390×844 demo QA verified cross-folder favorite/unfavorite behavior and zero browser warnings; the complete app/static/service-worker suite passes 78/78. Version metadata, README, D-041, product truth, and session log are aligned. Commit, fast-forward to `main`, push, Pages verification, packaging, and maintenance-record update remain.

## Decided

- D-041 records the complete user-confirmed behavior and its simple personal-app sync boundary.
- Existing D-011 outer-edge ±10-second video seek remains; the rest of the media surface uses double-tap favorite toggle.
- Account state contains only file IDs, timestamps, and favorite tombstones in private Drive app data plus an account-keyed local cache.
- Favorites spans every folder and hides the irrelevant deep-scan control.

## Waiting on the user

- None.

## Next first action

Review the complete task-owned diff, commit v1.19.0, fast-forward it into `main`, push, and verify GitHub Pages bytes before packaging and updating the maintenance record.

## Tried

- Chrome DevTools browser connection was unavailable because its persistent profile was locked; the in-app browser verified the same desktop/mobile demo surfaces instead.
- The in-app browser cannot inject raw touch events, so double-tap and edge-swipe commits are covered by deterministic event-level tests rather than claimed as physical iPhone evidence.
- `node --check app.js`, `node --check sw.js`, `git diff --check`, and all 78 Node tests pass; final v1.19.0 demo loaded cache-busted assets with no warnings/errors.
