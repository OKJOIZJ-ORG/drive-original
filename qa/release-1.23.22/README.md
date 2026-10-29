# Release 1.23.22 — D129 (D130 approved)

| Item | Value |
|---|---|
| Change | Random order survives trash/move (subfolders on, favorites, moves inside the subtree); removing the file being viewed moves to the next file of the player order and keeps the random-shorts back history |
| Commits | ec1b4ba fix, 2499570 release; main fast-forwarded and pushed |
| Worker | drive-original version 40123793-351e-48fd-84be-a542eeb3415f (`npm run deploy:release`, dry run first) |
| Tests | 1050/1050 (`node --test tests/*.test.js tests/*.test.mjs`); new tests/removal-order.test.js fails 4/6 on the 1.23.21 app code |
| Served bytes | 83/83 public files equal to Git HEAD; version.json 1.23.22 |

## Observed

- Local demo (chrome-ai, `?demo=1`, subfolders all, random sort, 6 files): opened the 2nd card, one random-shorts swipe, trashed the current file through the dialog. Library order of the remaining 5 unchanged; player went to the next id of `playbackOrderIds` (demo-video-4); deck kept `above` [demo-image-2, demo-video-1].
- Production (chrome-ai, signed out): APP_VERSION 1.23.22 with the new functions loaded under the production service worker.

## Not verified

- Signed-in real Drive trash/move (not performed so no user file is trashed or moved), phones.
