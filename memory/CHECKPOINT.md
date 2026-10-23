# Checkpoint — D109 1.23.15 delivered — 2026-10-23

## The story so far
1.23.14 (D104/D105) was live as Worker 10a444bb. D107 (first-load: listing no longer waits for the account sync; writer read cache and pool 16) and D108 (listing without `parents`, first page 100, photo and next-item pin prewarm) were released together as 1.23.15.

## Latest
1.23.15 is live: Worker 75f98a18, main 38047e3. 986/986; 81/81 served Git-equal; bindings 11 equal. Actual Chrome (user profile): v1.23.15, 22 likes, first-load summary 1.55 s (was 6.1–7.3 s), big-folder first page 0.98 s, next photo/video ~1.2 s (was 2.3–3.0 s), liked videos play original-range. qa/release-1.23.15 owns numbers; qa/initial-load-20261023 and qa/media-load-20261023 own the code changes.

## Decided
D094–D106 as before; D107/D108 changes; D109 authorized this delivery. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not decided: showing a large Drive thumbnail while a photo original loads (D108, original-viewer principle); widening the 4 MiB moov window (#6 type).

## Next first action
Read qa/release-1.23.15/README.md. App code lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout. Never deploy if materialize exits non-zero. Right after a deploy the edge may serve the previous index.html for a few seconds; re-fetch before judging a mismatch.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Navigation preload must stay off (/auth/* navigations are not answered by the SW).
Under D103 the SW serves ?v=<its VERSION> app scripts from its install batch: any change to public bytes needs a version bump to reach updated clients.
Classic scripts resolve import() against their own URL; app/*.js imports use ../media/. Demo mode never loads media modules, so verify module paths with a real playback or the static test.
Measuring: set `__driveOriginalMediaTraceSink`; patched functions can be evaluated into the production page for before/after runs (qa/media-load-20261023/gen-inject2.cjs). Background tabs throttle rAF/WAAPI. Drive files.list caps pages at 460 when `parents` is requested.
