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
- `verified locally 2026-09-16`: v1.15.0 uses deliberate dominant-axis swipe thresholds with cancellation recovery, compact desktop playback controls, `,`/`.` and UI frame stepping, and a focus-contained responsive player. Evidence: source review, focused gesture tests, desktop/mobile demo interaction, and 35/35 Node tests.
- `verified locally 2026-09-16`: Long press on touch or right-click/Select on desktop enters multi-select; bulk trash and folder move use a four-worker task pool and retain only failed items after partial failure. Evidence: source review, deterministic task-pool/capability tests, and demo bulk-action flows.
- `verified locally 2026-09-16`: The media proxy scopes tokens/errors to the requesting client, preserves Range and resource-key headers over one correlated 401 refresh retry, and aborts stale upstream work. Video failures do not trigger a full-file Blob fallback; Drive recovery opens a top-level view URL. Evidence: 10 service-worker contract tests plus app/static regression tests.
- `verified locally 2026-09-16`: Mobile demo navigation scores 100 for Lighthouse accessibility, best practices, SEO, and agentic browsing; an unthrottled local trace measured LCP 318ms and CLS 0.00. These are local demo measurements, not field data.
- `operational 2026-09-16`: GitHub Pages serves v1.15.0 from release commit `b813a15d29b97915b01b553dd758218e5451de86`. Actions run `35077604373` succeeded; live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 and matched Git blobs byte-for-byte. Both 103,841-byte ZIPs have SHA-256 `8D87B29890DF0284CF95E003955D74E9E369BC906A96A298D39144EBED621059`; the Notion maintenance page was updated and re-fetched with matching release data.

## Not implemented

- A content-derived static first-frame preview for GIF cards is not implemented; the deliberate safe fallback is a generic static placeholder.
- A live cross-drive move was not executed during verification because no authenticated, non-destructive test topology was available.
- Authenticated Google token renewal, real Drive Range playback, and physical iOS Safari gestures were not exercised in this local demo verification.

## Permanently excluded

<!-- Link the decision ledger entry for every exclusion. -->
