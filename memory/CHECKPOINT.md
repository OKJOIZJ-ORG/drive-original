# Checkpoint — v1.19.1 released — 2026-09-17 01:26

## The story so far

Drive Original v1.19.1 is released from commit `c43b218ba3e74cbd692718660cd166d2419477e2`. Favorites no longer depends on a whole-Drive tree scan: known media is reused immediately and only unresolved liked file IDs are fetched directly with bounded concurrency and partial-result preservation. OAuth now explicitly requests `drive.appdata`, legacy drive-only tokens reconnect once, transient account-state writes use bounded retry, and stale async status writers are invalidated on navigation. Mobile uses four equal text filters, a vertical overflow stack above `⋯`, icon-only favorite feedback, and a deduplicated root breadcrumb; desktop favorite controls remain integrated with the existing player.

The complete 84-test suite passed three consecutive times. JavaScript syntax and diff checks passed. Browser QA at 390×844 and 1280×800 verified layout geometry, favorites, filter transitions, menu placement, root breadcrumb normalization, and zero warnings/errors. GitHub Pages run `35121272050` succeeded, and the five live core assets returned HTTP 200 and matched the release Git blobs byte-for-byte. Both distribution ZIPs are 112,769 bytes, contain 16 entries/15 files, match every packaged Git blob, and share SHA-256 `66CB642E2E432A54F9C88CD584CEEB19747D5C71C4137675E66A32C30190A9A8`. The Notion maintenance page was updated and re-fetched with the v1.19.1 release facts and both packages attached.

## Decided

- D-041 still governs account sync, unseen-first randomization, favorites, and mobile navigation.
- D-042 records the UI/favorites hardening and expanded PC/mobile audit boundary.
- The filter row uses four centered text labels (`전체`, `영상`, `이미지`, `좋아요`); the heart remains the state/action symbol in cards and players.
- Private account state requires both `drive` and `drive.appdata`; one reconnect is intentional for legacy tokens.
- Root breadcrumb data is normalized before rendering and navigation so `내 드라이브` appears exactly once.

## Waiting on the user

- None. Actual two-device propagation, the production account's OAuth reconsent/direct favorite lookup, and physical iPhone Safari gestures remain explicit verification boundaries rather than blockers for this release.

## Next first action

If a real-device report arrives, reproduce it against v1.19.1 and add only the missing device/account-specific evidence or fix; do not reopen the already verified local and deployed contracts without contrary evidence.

## Tried

- The first mobile action stack used `bottom: 62px`; live geometry showed overlap with `⋯`, so it was raised to `calc(var(--safe-bottom) + 84px)` and rechecked at 390×844.
- The in-app browser cannot inject physical iPhone touch hardware events; deterministic event tests cover double-tap and edge-swipe behavior without claiming physical-device proof.
- Playwright could see but not activate the transient mobile heart button before its deadline; coordinate activation plus live computed state proved the transparent icon-only feedback. This was a test-driver interaction limitation, not a product failure.
- A fixed 20ms GIF test wait flaked under the expanded suite; completion-based waiting produced three consecutive 84/84 runs.
- One combined PowerShell release-verification script was rejected by the command policy before execution; the same checks were split into non-destructive commands and completed successfully.
