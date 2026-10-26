# Checkpoint — D120 1.23.19 delivered — 2026-10-26

## The story so far
1.23.18 (D116 background trash/move) was live as Worker 706fec6e. The user then asked for pinch zoom with a lock, no focus rings, a copyable full-name popup on the card's lower part (D118), and for picking which subfolders to include, one loading message and app-styled dropdowns (D119). Both were released together as 1.23.19 (D120).

## Latest
1.23.19 is live: Worker 96dd5a1a, main e9df1ec. 1018/1018; 81/81 served Git-equal. Actual Chrome (user profile): one loading message; sort dropdown; picker chose 추억/영상 only and Drive listed just 3 folders (285 media in 0.54 s); name popup; photo zoom 2.6×, lock, reset. Settings restored, no file changed. qa/release-1.23.19 owns numbers.

## Decided
D094–D117 as before; D118 zoom/focus/name popup; D119 subfolder picker/progress line/dropdowns; D120 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not verified: physical-phone pinch, real trackpad pinch, real clipboard copy, shared drives in the picker. Not decided: thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; the license-pinned video-q3-input.mjs terminator weakness.

## Next first action
Read qa/release-1.23.19/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Local demo check: first check whether 127.0.0.1:8765 already listens (any chat's `python -m http.server 8765 --directory source`); if so reuse it, since it serves current disk files, and open `/?demo=1` in an own chrome-ai tab (unregister the service worker or hard-reload to see new code). Start it from the workspace root launch config (`.claude/launch.json`, name static-demo) only when nothing listens; never add alternate ports/configs (2026-10-26 slip). The built-in browser pane only reaches its own preview and cannot screenshot while hidden.
