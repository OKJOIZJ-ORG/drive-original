# PRODUCT TRUTH — Drive Original

Evidence class: local source code plus dated automated/browser verification. External claims may be sourced only from entries that are `operational` or `verified`.

## Implemented

- `verified 2026-08-23`: Media list rendering keeps the complete population in memory while mounting no more than 240 cards. Evidence: `tests/app.test.js` G-drive-scale test (9,788 items) and desktop/mobile browser smoke.
- `verified 2026-08-23`: GIF cards never attach `thumbnailLink` or any `<img>`; they render a static SVG placeholder. Opening the original GIF can still animate it. Evidence: `createFileCard` and the 501-GIF scale fixture.
- `verified implementation 2026-08-23`: Move destinations exhaust the user corpus, enumerate every shared-drive root, supplement with per-drive folder scans at concurrency 2, retain orphan/cycle rows, and expose capability/API failures. Evidence: source review, pagination/catalog/capability tests, and current Google Drive API references.
- `verified 2026-08-23`: Shorts previous/next/random and random sort wait for the complete target-folder supported-media population and ignore display search/filter subsets. Evidence: population/order tests and browser interaction smoke.
- `verified 2026-08-23`: The app requests `https://www.googleapis.com/auth/drive`; it stores the OAuth client ID, short-lived access token, and expiry in local storage for automatic login, and sends the token to service-worker memory during execution. Evidence: `app.js`, README contract test.
- `operational 2026-08-23`: GitHub Pages serves v1.14.0 at HTTP 200. Evidence: Actions runs 32646709841 and 32646842133 plus live `version.json`.
- `verified locally 2026-09-16`: Favicon/PWA/Apple touch/maskable assets and the in-app header use the rounded navy Drive Original logo system with no legacy blue accent. Evidence: 15/15 Node tests, rendered asset inspection, and Chrome demo DOM/computed-style readback.
- `operational 2026-09-16`: GitHub Pages serves v1.14.1 and the live `version.json` plus four PNG icon assets are byte-identical to Git blobs at release commit `9580da6254e9f2b73d15a3947e43a534d3ffc9d3`. Evidence: Actions run 35066797555, HTTP 200, and Node `Buffer.equals` readback.
- `observed 2026-09-16`: Windows desktop and Start menu shortcuts reference `C:\Users\jbs\AppData\Local\CustomAppIcons\drive_original_rounded_navy.ico`; the ICO contains 16, 24, 32, 48, 64, 128, and 256px entries and rendered successfully at 64px.

## Not implemented

- A content-derived static first-frame preview for GIF cards is not implemented; the deliberate safe fallback is a generic static placeholder.
- A live cross-drive move was not executed during verification because no authenticated, non-destructive test topology was available.

## Permanently excluded

<!-- Link the decision ledger entry for every exclusion. -->
