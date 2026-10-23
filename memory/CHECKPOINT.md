# Checkpoint — D104 1.23.14 delivered — 2026-10-23

## The story so far
1.23.12 (D101/D102) was live as Worker bb66276a. D103 (performance pass) and D104 (app.js split into 18 ordered classic scripts under app/) were released together.

## Latest
1.23.14 is live: Worker 10a444bb, main 482484b. 1.23.13 (f9f8ae36, 1ba6bf7) broke video opening because import('./media/…') inside app/*.js resolved to /app/media/; 1.23.14 uses ../media/ plus a static resolution test. 979/979; 81/81 served Git-equal; bindings 11/4 equal. Actual Chrome (user profile): v1.23.14, same account, 22 likes, 3 short liked videos play original-range (first progress 2.6–4.0 s), modules load from /media/. qa/release-1.23.14 owns numbers; qa/modularize-20261023 and qa/refactor-perf-20261023 own the code changes.

## Decided
D094–D103 as before; D104 supersedes the D096 no-file-split clause and authorized this delivery; D105 records the same-day 1.23.14 fix-forward. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not decided: widening the 4 MiB moov window (#6 type).

## Next first action
Read qa/release-1.23.14/README.md. App code now lives in app/ (map: app/README.md); the order is owned by scripts/public-files.cjs.

## Tried
Deploy (D106): from source/worker run `npm run deploy:release` (validate first with `npm run deploy:release -- --dry-run`). It requires committed publication inputs, deploys HEAD from a temporary detached worktree under %TEMP% and removes it. The user's C:\DriveBackup\Projects-mirror hard-link backup is intentional (D106): never modify it, and do not use `deploy:candidate` in the checkout (the materializer refuses its linked inputs). Never deploy if materialize exits non-zero.
Transient Drive for desktop upload links (C:\Projects\.tmp.driveupload) still apply to freshly changed files in the main checkout.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Navigation preload must stay off (/auth/* navigations are not answered by the SW).
Under D103 the SW serves ?v=<its VERSION> app scripts from its install batch: any change to public bytes needs a version bump to reach updated clients.
Classic scripts resolve import() against their own URL; app/*.js imports use ../media/. Demo mode never loads media modules, so verify module paths with a real playback or the static test.
Measuring startup: set `__driveOriginalMediaTraceSink`; app scripts are classic scripts with replaceable globals (tests/app-loader.cjs loads them in order).
