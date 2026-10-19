# Checkpoint — D100 video startup pin prewarm (local branch) — 2026-10-19

## The story so far
Production is 1.23.10 (D099): runtime b4c27e2, Worker 02b55d4c at drive-original.jyw-drive.workers.dev, 947/947 at release. RELEASE-1.23.10.md owns that proof.

## Latest
D100 on branch claude/video-startup-perf-20261019 (not merged/pushed/deployed): measured video startup on actual Chrome and cut the Q0 revision pin from the critical path (hinted parallel download POST + card hover/press prewarm adopted by the SW retained-pin handshake). Click→first frame median −0.4…−0.7 s (tap) and −0.4…−1.0 s (400 ms hover) on five liked videos; 959/959 tests. qa/video-startup-20261019 owns numbers.

## Decided
D094–D099 as before; D100 performance scope (original-bytes-first, auth checks, tests kept). Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
1.23.11 deployed (Worker ac8f076c, main 523e1db). Paused before verification: actual Chrome tab showed signed-out screen (cause unknown); served-byte check unfinished. Resume: check sign-in in the user's Chrome, then served bytes and playback.

## Next first action
Read qa/video-startup-20261019/README.md.

## Tried
Deploy: `npm run deploy:candidate` now works as-is; the materializer waits (≤120 s) for Google Drive for desktop's temporary upload hard link in C:\Projects\.tmp.driveupload. Never deploy if materialize exits non-zero.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Measuring startup: set `__driveOriginalMediaTraceSink` in the page (app + SW stages) and use requestVideoFrameCallback; candidate page code can be injected into the production tab because app.js is a classic script with replaceable globals (SW code cannot).
