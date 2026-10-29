# Checkpoint — D128 1.23.21 delivered — 2026-10-29

## The story so far
1.23.20 (D121 rename, D122 PC → hold 2×) was live as Worker 8bf12c8f. The user then asked for a trash button in the photo viewer (D125), no re-loading of folders already read when adding subfolders plus overall loading optimization (D126), and an end-of-playback option with 처음부터 as default (D127), and released all three as 1.23.21 (D128).

## Latest
1.23.21 is live: Worker f0c33cae, main a42bce8. 1044/1044; 83/83 served Git-equal. Actual Chrome (user profile): photo trash confirmation by click and Delete (cancelled, nothing trashed); after a 55 s first scan of 24 folders/13,313 files, re-toggling subfolders and navigating the scanned folders sent 0 Drive requests; end actions 처음부터/멈춤/다음 영상 on a real 7.9 s video, restored to 처음부터. qa/release-1.23.21 owns numbers.

## Decided
D094–D120 as before; D121 file rename; D122 PC → hold 2× and drive-actions.js split into drive-mutations/drive-actions/move-dialog; D123 delivered 1.23.20; D124 rename keeps Drive's modifiedTime change; D125 photo topbar trash + Delete key; D126 folders read once are cached until Refresh, listing seed, pass-through folders from the picker, pipelined pool of 8; D127 end action (default 처음부터, per device); D128 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not verified: 랜덤 쇼츠 end action and end actions on Q1/Q2/Q3 sources on real Drive, the mobile ⋯ 끝나면 chip on a phone, old-code real-Drive time for the 55 s scan (comparison is simulated); a physically held → key, rename on a phone, physical-phone pinch, real trackpad pinch, real clipboard copy, shared drives in the picker. Not decided (older): thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; the license-pinned video-q3-input.mjs terminator weakness.

## Next first action
Read qa/release-1.23.21/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Local demo check: first check whether 127.0.0.1:8765 already listens (any chat's `python -m http.server 8765 --directory source`); if so reuse it, since it serves current disk files, and open `/?demo=1` in an own chrome-ai tab (unregister the service worker or hard-reload to see new code). Start it from the workspace root launch config (`.claude/launch.json`, name static-demo) only when nothing listens; never add alternate ports/configs (2026-10-26 slip). The built-in browser pane only reaches its own preview and cannot screenshot while hidden.
