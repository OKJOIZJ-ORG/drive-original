# Checkpoint — D094 1.23.6 operating delivery complete — 2026-10-19

## The story so far
User D094 asked for a full review and proactive patches, then explicitly asked to release them as 1.23.6. Ten confirmed fixes (auth storage rows, callback return, SW redirected shell cache, playback speed restore, library window/refresh/favorites, media error codes/cleanup, subtitle empty edit) are on main ab025b7, pushed, and deployed to the same Worker drive-original (version 0b6180cc, previous 7c761d33) at drive-original.jyw-drive.workers.dev. 938/938 tests; seven changed public files Git-equal; private 404; anonymous credential 401/no-store; 11 bindings/4 secret names unchanged; production license link works under an SW with a redirected cache entry. RELEASE-1.23.6.md owns proof.

## Decided
D094: full review with local patches; deployment of 1.23.6 explicitly requested afterwards. Original/auth config/free-operation/Notion/automation PAUSED boundaries persist.

## Waiting on the user
Optional: signed-in account check (normal update, likes preserved, playback) was not performed in this release.

## Next first action
Read source/memory/RELEASE-1.23.6.md. Not applied from the review: media-stage focus-visible ring (design choice), clientCredentials pruning (low).

## Tried
First deploy stopped at materialization guard (transient nlink 2 on media/video-q3-codec.mjs; one link per fsutil); re-run passed, nothing uploaded by the failed attempt.
Wrangler was logged out on this PC; the user logged in. My first suggested login command included offline_access, which wrangler rejects as a --scopes value; corrected command worked.
A local static server cannot reproduce the production 307s; the redirect fix was verified on production after deploy.
