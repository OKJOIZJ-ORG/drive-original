# Release 1.23.26 — D135, D136 (D137 approved)

| Item | Value |
|---|---|
| Change | D135: WebP cards with a Drive `thumbnailLink` use the native `<img>` path instead of the canvas path. D136: the four date sorts show year-month dividers in the media grid |
| Commits | d54b5fe feature, 45d4bdd release; main fast-forwarded and pushed |
| Worker | drive-original version f3db1e52-47f9-4f91-b8d1-485a50501045 (`npm run deploy:release`, dry run first) |
| Tests | 1136/1136 (`node --test tests/*.test.js tests/*.test.mjs`); 4 new tests in tests/app.test.js |
| Served bytes | 91/91 public files equal to Git HEAD 45d4bdd; 7 private paths 404; anonymous credential 403 with `Cache-Control: no-store` (`served-check.cjs`, `served.json`); version.json 1.23.26 |

The first dry run was invalid: the first release commit missed two version strings in `index.html` and one test failed. The release commit was amended before any push, the suite was rerun at 1136/1136, and the dry run was repeated.

## Served comparison

- Node `fetch` hung for about 1 hour on the large `licenses/` parts, and still stalled after timeouts and retries were added. The script now downloads with curl.
- curl's full pass reported 89/91. `index.html` and `licenses/index.html` answer 307 to their directory, and that pass did not follow redirects, so it hashed an empty body. Those two files were rechecked with redirects followed and are equal to Git; their rows in `served.json` carry `redirected: true`. The script now passes `-L`. The script with `-L` was not rerun over all 91 files.
- 5 downloads of `licenses/` parts hit the 900 s limit at 5.6–7.8 MB of 8 MB and passed on curl's retry. Large files served slowly on this connection: 125 KB/s in one direct download and about 8 KB/s in the timed-out attempts. Cause not investigated.

## Observed

- Production, signed-in normal Chrome, app and served version 1.23.26, service worker controlling.
- WebP folder (347 files): 12 visible WebP thumbnails all loaded by 1,654 ms, 0 canvases and 0 placeholders in view; one divider `2026년 10월`. Measurement of the same change in a production folder before release: 3.80 s → 1.32 s.
- Folder with 5,255 files: dividers 2026년 10월/9월/8월 (3 dividers); cards in view at scroll 0.3, 0.6, 0.95 and 0; no console errors. No horizontal overflow in the WebP folder.
- Local demo with 3,255 fixture files over 30 months: no horizontal overflow at 6 and 2 columns; 231–239 cards mounted.

## Not verified

- Physical phones and WebKit. The mobile check is Chromium device emulation.
- WebP files without a `thumbnailLink`, and thumbnail load failures, on production. Covered only by tests.

## Known limits

- A divider's computed position differs from its final position by up to about 82 px until the cards around it render. Document height moved at most 19 px in the same check.
- Dividers follow Drive `modifiedTime` or `createdTime`, not the capture date. On this account `createdTime` is the upload date, so the created sorts put almost everything under 2026년 10월. The user decided to keep this ("그러면 그냥 현행 유지하자") and declined filename-date grouping.
- Tabs that were already open keep the old code until the normal app update is applied.
