# Checkpoint — D117 1.23.18 delivered — 2026-10-26

## The story so far
1.23.17 (D113 move dialog recent folders and server search) was live as Worker 5a6bd648. The user asked that trash and move stop holding the dialog until done; D116 closes the dialog at once, hides the target files, and runs the work as a background queue with a bottom status. Released as 1.23.18 (D117).

## Latest
1.23.18 is live: Worker 706fec6e, main b35fa8c. 1009/1009; 81/81 served Git-equal. Actual Chrome (user profile) with Drive writes stubbed in that tab: dialogs closed in 14 ms, status showed progress, parent-folder navigation worked during a move, files came back on failure. No user file changed. qa/release-1.23.18 owns numbers.

## Decided
D094–D115 as before; D116 background trash/move; D117 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not verified in production: a real successful background trash/move. Not decided: thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; the license-pinned video-q3-input.mjs terminator weakness.

## Next first action
Read qa/release-1.23.18/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Local demo check: first check whether 127.0.0.1:8765 already listens (any chat's `python -m http.server 8765 --directory source`); if so reuse it, since it serves current disk files, and open `/?demo=1` in an own chrome-ai tab (unregister the service worker or hard-reload to see new code). Start it from the workspace root launch config (`.claude/launch.json`, name static-demo) only when nothing listens; never add alternate ports/configs (2026-10-26 slip). The built-in browser pane only reaches its own preview and cannot screenshot while hidden.
