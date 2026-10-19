# Checkpoint — D099 1.23.10 root-cause fixes delivered — 2026-10-19

## The story so far
1.23.6 (review fixes), 1.23.7 (UI/UX) and 1.23.8 (behavior-preserving refactor, D096) are delivered to the same Worker drive-original at drive-original.jyw-drive.workers.dev; current Worker version b5aaf144, runtime f85f1c9. 940/940 tests; served bytes Git-equal; bindings/secrets unchanged; auth endpoints correct; actual signed-in Chrome on 1.23.8 with credential refresh, likes, navigation and playback. RELEASE-1.23.8.md owns proof.

## Latest
1.23.10 (D099): Q3 codec bytes = license manifest, Drive-upload hardlink tolerated by the materializer, Q3 passes Q1_SOURCE causes. Runtime b4c27e2, Worker 02b55d4c, 947/947, 65/65 served Git-equal, actual signed-in Chrome OK. Previous 1.23.9 = D097 UI. RELEASE-1.23.10.md owns proof.

## Decided
D094 review/patch, D095 UI/UX, D096 refactor, D097 simple UI, D098 1.23.9 delivery, D099 root fixes/1.23.10; each deployment explicitly requested. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Both 2026-10-19 open questions were closed by D099.

## Next first action
Read source/memory/RELEASE-1.23.10.md.

## Tried
Deploy: `npm run deploy:candidate` now works as-is; the materializer waits (≤120 s) for Google Drive for desktop's temporary upload hard link in C:\Projects\.tmp.driveupload. Never deploy if materialize exits non-zero.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
