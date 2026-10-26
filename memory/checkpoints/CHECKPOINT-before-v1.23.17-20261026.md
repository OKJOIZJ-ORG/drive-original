# Checkpoint — D112 1.23.16 delivered — 2026-10-26

## The story so far
1.23.15 (D107/D108) was live as Worker 75f98a18. D110 (created-date/size/duration/name sort orders, brand button returns home) and D111 (the optional Q2 audio probe no longer stops Q0 playback on QuickTime list terminators or sound description v1/v2; probe verdicts classified, transient reads retried once, cause-specific dialog text) were released together as 1.23.16.

## Latest
1.23.16 is live: Worker 8c48f820, main a42d82c. 1000/1000; 81/81 served Git-equal. Actual Chrome (user profile): x_20260820_5e365a54.mov plays original-range to its end; all sort orders verified on 240 cards; brand click lands on 내 드라이브 root. qa/release-1.23.16 owns numbers; qa/probe-quicktime-20261026 owns the D111 root cause.

## Decided
D094–D111 as before; D112 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not decided: thumbnail preview while a photo original loads (D108); widening the 4 MiB moov window; fixing the same terminator weakness in license-pinned video-q3-input.mjs (needs a regenerated corresponding-source manifest; Q3 route only).

## Next first action
Read qa/release-1.23.16/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Navigation preload must stay off (/auth/* navigations are not answered by the SW).
Under D103 the SW serves ?v=<its VERSION> app scripts from its install batch: any change to public bytes needs a version bump to reach updated clients.
Classic scripts resolve import() against their own URL; app/*.js imports use ../media/. Demo mode never loads media modules, so verify module paths with a real playback or the static test.
Measuring: set `__driveOriginalMediaTraceSink`; patched functions can be evaluated into the production page for before/after runs (qa/media-load-20261023/gen-inject2.cjs). Background tabs throttle rAF/WAAPI. Drive files.list caps pages at 460 when `parents` is requested.
