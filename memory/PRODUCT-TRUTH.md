# PRODUCT TRUTH — Drive Original

Evidence class: local source code plus dated automated/browser verification. External claims may be sourced only from entries that are `operational` or `verified`.

## Implemented

- `verified 2026-08-23`: Media list rendering keeps the complete population in memory while mounting no more than 240 cards. Evidence: `tests/app.test.js` G-drive-scale test (9,788 items) and desktop/mobile browser smoke.
- `verified 2026-08-23`: GIF cards never attach `thumbnailLink` or any `<img>`; they render a static SVG placeholder. Opening the original GIF can still animate it. Evidence: `createFileCard` and the 501-GIF scale fixture.
- `verified implementation 2026-08-23`: Move destinations exhaust the user corpus, enumerate every shared-drive root, supplement with per-drive folder scans at concurrency 2, retain orphan/cycle rows, and expose capability/API failures. Evidence: source review, pagination/catalog/capability tests, and current Google Drive API references.
- `verified 2026-08-23`: Shorts previous/next/random and random sort wait for the complete target-folder supported-media population and ignore display search/filter subsets. Evidence: population/order tests and browser interaction smoke.
- `verified 2026-08-23`: The app requests `https://www.googleapis.com/auth/drive`; it stores the OAuth client ID, short-lived access token, and expiry in local storage for automatic login, and sends the token to service-worker memory during execution. Evidence: `app.js`, README contract test.
- `operational 2026-08-23`: GitHub Pages serves v1.14.0 at HTTP 200. Evidence: Actions runs 32646709841 and 32646842133 plus live `version.json`.

## Not implemented

- A content-derived static first-frame preview for GIF cards is not implemented; the deliberate safe fallback is a generic static placeholder.
- A live cross-drive move was not executed during verification because no authenticated, non-destructive test topology was available.

## Permanently excluded

<!-- Link the decision ledger entry for every exclusion. -->
