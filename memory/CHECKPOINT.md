# Checkpoint — D114 1.23.17 delivered — 2026-10-26

## The story so far
1.23.16 (D110 sort/home, D111 QuickTime probe) was live as Worker 8c48f820. The user found the 폴더로 이동 dialog unusably slow; D113 added remembered destinations per account (shown at once) and Drive server search while the full folder index loads. Released as 1.23.17 (D114).

## Latest
1.23.17 is live: Worker 5a6bd648, main cd18847. 1006/1006; 81/81 served Git-equal. Actual Chrome (user profile): the account's move index is 43,860 folders (~150 s); typing 추억 during loading showed it in ~1.1 s; a remembered 추억 appeared at once after reload and was selectable while loading. No user file was moved. qa/release-1.23.17 owns numbers.

## Decided
D094–D113 as before; D114 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not decided: persisting the 43,860-folder move index (IndexedDB); thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; the license-pinned video-q3-input.mjs terminator weakness.

## Next first action
Read qa/release-1.23.17/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Local demo check: python -m http.server from the workspace root launch config (`.claude/launch.json`, name static-demo) serves source/ at 127.0.0.1:8765; open `/?demo=1`. The built-in browser pane cannot screenshot while hidden; drive it with read_page/JS.
