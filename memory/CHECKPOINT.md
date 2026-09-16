# Checkpoint — v1.19.1 ready for release — 2026-09-17 01:19

## The story so far

Drive Original v1.19.1 is implemented on `codex/mobile-action-stack`. Mobile overflow actions stack vertically above `⋯`, double-tap feedback is an icon-only heart, the filter row is four equal text tabs, and the duplicate root breadcrumb found during QA is fixed. Favorites now requests the explicit Drive app-data scope, forces a one-time reconnect for legacy tokens, retries transient state writes, resolves known items locally, directly fetches only missing liked IDs, preserves partial results, cancels stale loads, and uses request-owned library status messages. The 84-test suite passed three consecutive runs; app/worker syntax and diff checks pass. Mobile 390×844 and desktop 1280×800 demo QA verified favorites, view changes, geometry, and zero browser warning/error logs. Commit, main publication, Pages byte proof, packaging, and maintenance-record readback remain.

## Decided

- D-041 still governs account sync, unseen-first randomization, favorites, and mobile navigation.
- D-042 records the user-confirmed UI/favorites hardening and the expanded PC/mobile audit boundary.
- The filter row uses four centered text labels (`전체`, `영상`, `이미지`, `좋아요`); the heart remains the state/action symbol in cards and players rather than duplicating it in the filter label.
- Private account state now requires both `drive` and `drive.appdata`; a one-time reconnect is intentional for legacy tokens.
- Root breadcrumb data is normalized before rendering and navigation so `내 드라이브` appears exactly once.

## Waiting on the user

- None. Actual two-device propagation and physical iPhone Safari gestures remain device/account-specific evidence boundaries, not blockers for the patch.

## Next first action

Review and stage the task-owned diff, commit v1.19.1, fast-forward `main`, push, and verify the Pages artifacts byte-for-byte before packaging and maintenance-record update.

## Tried

- The earlier mobile action stack used `bottom: 62px`; live geometry showed overlap with `⋯`, so it was raised to `calc(var(--safe-bottom) + 84px)` and rechecked at 390×844.
- The in-app browser cannot inject physical iPhone touch hardware events; deterministic event tests remain required for double-tap and edge-swipe behavior.
- Playwright could see but not activate the transient mobile heart button before its deadline; coordinate activation plus live computed state proved the transparent icon-only feedback. This was a test-driver interaction failure, not a product failure.
- A fixed 20ms GIF test wait flaked under the expanded suite; replacing it with completion-based waiting produced three consecutive 84/84 runs.
