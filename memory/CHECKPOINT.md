# Checkpoint — D123 1.23.20 delivered — 2026-10-27

## The story so far
1.23.19 (D118 zoom/name popup, D119 subfolder picker) was live as Worker 96dd5a1a. The user then asked for file rename (D121), PC key for hold-to-2× plus the recommended drive-actions split (D122), and released both as 1.23.20 (D123).

## Latest
1.23.20 is live: Worker 8bf12c8f, main 4ed1c70. 1032/1032; 83/83 served Git-equal. Actual Chrome (user profile): real rename and rename-back of one video in 추억/영상 through the card popup; → tap +10 s; → hold 2× and restore. qa/release-1.23.20 owns numbers.

## Decided
D094–D120 as before; D121 file rename; D122 PC → hold 2× and drive-actions.js split into drive-mutations/drive-actions/move-dialog; D123 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
Observed side effect: Drive moves a file's modifiedTime to the rename time, so a renamed file jumps to the top of 수정일 최신순. The verification file x_20260820_81ba8a74.mp4 now shows 2026-10-27 instead of 2026-08-20. Not decided: restore that timestamp, and whether renames should keep the original modifiedTime. Not verified: a physically held → key, rename on a phone, physical-phone pinch, real trackpad pinch, real clipboard copy, shared drives in the picker. Not decided (older): thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; the license-pinned video-q3-input.mjs terminator weakness.

## Next first action
Read qa/release-1.23.20/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Local demo check: first check whether 127.0.0.1:8765 already listens (any chat's `python -m http.server 8765 --directory source`); if so reuse it, since it serves current disk files, and open `/?demo=1` in an own chrome-ai tab (unregister the service worker or hard-reload to see new code). Start it from the workspace root launch config (`.claude/launch.json`, name static-demo) only when nothing listens; never add alternate ports/configs (2026-10-26 slip). The built-in browser pane only reaches its own preview and cannot screenshot while hidden.
