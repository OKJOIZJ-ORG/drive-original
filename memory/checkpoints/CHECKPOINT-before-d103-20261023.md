# Checkpoint — D102 1.23.12 delivered — 2026-10-20

## The story so far
1.23.11 (D100): Worker ac8f076c, main 523e1db. Revision pin hinted/prewarmed; qa/video-startup-20261019 owns numbers.

## Latest
1.23.12 (D101/D102) live: Worker bb66276a, main 8232669. The SW parks a page-cancelled moov-at-end Q0 head (≤4 MiB, ≤10 s) and serves the restart range from it. 967/967; 64/64 served Git-equal. Actual Chrome on real Drive: the restart was served by the continuation in 15/15 opens of the 0.9 MB/15 MB files, with the restart's first byte ≤1 ms after its start. Press→first frame median is 3.74–3.75 s (≈ −0.7 to −0.9 s against 1.23.11). The 807 MB file restarts at ~8 MB, outside the window, so it is unchanged. qa/release-1.23.12 owns numbers.

## Decided
D094–D100 as before; D101 bounded continuation scope; D102 1.23.12 deployment. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
None. Not decided: whether to widen the 4 MiB window for large moov-at-end files (#6 type).

## Next first action
Read qa/release-1.23.12/README.md.

## Tried
Deploy: `npm run deploy:candidate`; the materializer waits (≤120 s) for Google Drive for desktop's temporary upload hard link in C:\Projects\.tmp.driveupload. When the upload queue is long (1.23.12: ~51 min), wait for nlink=1 on all publication inputs and then rerun. Never deploy if materialize exits non-zero.
Since 2026-10-19 22:53 the user's ~/.gitconfig sets core.autocrlf=false (not set by an agent). The materializer then reports "Publication input differs from captured HEAD" for CRLF checkouts. Leave the setting alone and run the deploy with GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0=core.autocrlf GIT_CONFIG_VALUE_0=true.
Wrangler login needs `npx wrangler login --scopes account:read user:read workers:write workers_scripts:write`; account ID cf830a3ca386bf7ee3592d15ef17242c.
License-pinned modules (audio-general-*.mjs, video-q3-*.mjs) must stay byte-identical unless corresponding-source manifests are regenerated.
Measuring startup: set `__driveOriginalMediaTraceSink` in the page (app + SW stages, including `reason: 'continuation'`) and use requestVideoFrameCallback; app.js is a classic script with replaceable globals (SW code is not). qa/q0-continuation-20261019/local-chrome is a local SW harness with a Drive-like server.
