# Checkpoint — D103 refactor/perf pass ready locally — 2026-10-23

## The story so far
1.23.12 (D101/D102) is live: Worker bb66276a, main 8232669 (+ docs 0590de9). qa/release-1.23.12 owns those numbers.

## Latest
D103 (user: "전체 리팩토링 & 성능 최대한 개선 … 알아서 ㄱㄱ"), branch claude/refactor-perf-20261023, committed locally only. Grid card reuse/no-op mounts, search debounce + lowercase cache, one-parse date sort, viewport-gated frame thumbnails with full slot refill, level-parallel deep scan in serial BFS order, cheaper account-state persist (byte-identical), credential request overlapped with SW install, SW cache-first for this release's ?v= files with no cross-release pollution, non-blocking cache writes, lh3 preconnect fix, no topbar blur on touch. 977/977. Demo-mode Chrome: unchanged-range render 67–97 → ~3 ms, window move 73–93 → 41–48 ms, typing 0.5 s → 0.4 ms sync, persist(10k) 45 → 35 ms, repeat launch skips 3 shell revalidations. qa/refactor-perf-20261023 owns details.

## Decided
D094–D102 as before; D103 local refactor/perf. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
Whether to release D103 (version bump 1.23.13, merge, push, deploy:candidate, real-Drive check). Not decided: widening the 4 MiB moov window (#6 type).

## Next first action
Read qa/refactor-perf-20261023/README.md; on approval follow the Tried deploy notes below.

## Tried
Deploy: `npm run deploy:candidate` (worker/); the materializer waits (≤120 s) for Google Drive for desktop's temporary upload hard link in C:\Projects\.tmp.driveupload. When the upload queue is long, wait for nlink=1 on all publication inputs and rerun. Never deploy if materialize exits non-zero.
The user's ~/.gitconfig sets core.autocrlf=false (since 2026-10-19 22:53, not set by an agent). Run the deploy with GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Navigation preload must stay off: /auth/* navigations are not answered by the SW, so a preload would send the OAuth callback twice.
Demo-mode perf harness: qa/refactor-perf-20261023/serve.cjs + bench-grid.js (no account or Drive access).
