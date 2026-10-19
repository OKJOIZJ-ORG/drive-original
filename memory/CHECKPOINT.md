# Checkpoint — D100 1.23.11 delivered — 2026-10-19

## The story so far
Production is 1.23.10 (D099): runtime b4c27e2, Worker 02b55d4c at drive-original.jyw-drive.workers.dev, 947/947 at release. RELEASE-1.23.10.md owns that proof.

## Latest
1.23.11 (D100) live: Worker ac8f076c, main 523e1db. Revision pin hinted/prewarmed; click→first frame ~0.4–1.0 s faster; 959/959; 64/64 served Git-equal; actual Chrome signed in, 20 likes, playback and player-next verified. qa/video-startup-20261019 owns numbers.

## Decided
D094–D099 as before; D100 performance scope (original-bytes-first, auth checks, tests kept). Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None for D100. Separate session branch claude/q0-moov-continuation-20261019 (a8f93b2, D101 proposal) is unmerged and undeployed; deploy only on explicit request.

## Next first action
Read qa/video-startup-20261019/README.md.

## Tried
Deploy: `npm run deploy:candidate` now works as-is; the materializer waits (≤120 s) for Google Drive for desktop's temporary upload hard link in C:\Projects\.tmp.driveupload. Never deploy if materialize exits non-zero.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Measuring startup: set `__driveOriginalMediaTraceSink` in the page (app + SW stages) and use requestVideoFrameCallback; candidate page code can be injected into the production tab because app.js is a classic script with replaceable globals (SW code cannot).
