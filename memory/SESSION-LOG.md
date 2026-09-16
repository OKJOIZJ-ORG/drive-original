# SESSION LOG — append, dated

## 2026-08-23

- Read the Notion maintenance page, every project text file, binary asset metadata/previews, and the existing D-001–D-028 decision ledger.
- Observed the clean local `main` branch was 13 commits ahead of `origin/main`; created `codex/full-library-stability` before source edits.
- Observed the `G:\` sample contains 62 folders, 9,930 files, 9,788 supported media files, and 501 GIF files.
- Read current Google Drive API documentation for `files.list`, `drives.list`, folder moves, pagination, corpora, and shared-drive support.
- Opened the active maintenance goal and recorded the user-confirmed behavioral requirements as D-029.
- Gemini advisory conversation `3e60a959-ea6a-4533-bece-de511854112e` challenged the first architecture; adopted its bounded-DOM and GIF-fallback cautions, subject to Codex verification.
- Added generation-owned and abortable page loading, complete-population singleflight, a 240-card virtual window, static GIF cards, shared-drive destination enumeration, permission-aware moves, raw resource-key headers, and rate-limit backoff.
- Added 14 automated checks covering pagination, repeated cursors, G-drive-scale rendering, GIF source absence, move catalogs/capabilities, full-population playback, version/HTML/assets/privacy contracts, and resource-key formatting.
- Verified the demo in desktop and 390×844 mobile viewports with no console warnings/errors or horizontal overflow.
- Packaged `Drive-Original-v1.14.0.zip` and `Drive-Original.zip` with matching SHA-256 `2392AC0DECCA44211E579282D9ECB771D775EC7C788E2E9B5498C22851A59DA1`.
- Pushed v1.14.0 to `main`; GitHub Pages served the live `version.json` with HTTP 200.
- Sanitized the local Git remote after a credential-bearing URL appeared in tool output. The exposed credential value was not recorded; revocation/reissue remains the safe follow-up.

## 2026-09-16

- Recorded the user-confirmed icon unification decision as D-030.
- Rebuilt the app identity assets from deterministic SVG masters: rounded navy background, continuous white outline, and no blue accent dot.
- Replaced the header's separate blue camera badge with `icons/icon-192.png`; favicon, PWA, Apple touch, maskable, and in-app brand surfaces now share the same navy logo system.
- Bumped the release metadata and cache version to v1.14.1 and added a static contract test for the brand-icon source, rounding, palette, and legacy-blue exclusion.
- Verified 15/15 Node tests and a local Chrome demo. The live DOM loaded a complete 192×192 brand image with `border-radius: 22%`, no background gradient, and no page console errors attributable to this change.
- Fast-forwarded the verified branch into `main`, pushed release commit `9580da6254e9f2b73d15a3947e43a534d3ffc9d3`, and observed GitHub Pages Actions run 35066797555 complete successfully.
- Verified live `version.json` and all four PNG icon assets returned HTTP 200 and matched the corresponding Git blobs byte-for-byte; live version read back as 1.14.1.
- Generated `C:\Users\jbs\Downloads\Drive-Original-v1.14.1.zip` and `Drive-Original.zip` with matching SHA-256 `3CB1B3715BE7675417B247142237C360B85FD9BEF6370FEF989BBF05E45EC092`.
- Generated the seven-resolution Windows ICO, updated the desktop and Start menu shortcuts, refreshed the shell icon cache, and verified a 64px extracted frame.
- Updated and re-fetched the Notion maintenance page; v1.14.1 version, release commit, Actions run, ZIP hash, D-030, and history row all matched the intended values.
- Opened the D-031 commercial-grade stabilization goal on `codex/commercial-grade-stability` and audited mobile/desktop interaction, authentication, Range streaming, thumbnails, large-list behavior, dialogs, accessibility, and bulk mutations.
- Implemented deliberate four-direction swipe thresholds and transition recovery; compact desktop and mobile player controls; frame stepping; long-press/right-click multi-select; partial-failure-safe bulk trash/move; bounded thumbnail work; and accessible responsive dialogs.
- Reworked authentication and the service-worker media contract around per-client correlated token requests, generation guards, exact Range/resource-key retry after one 401, abort propagation, and requester-only classified errors. Removed automatic full-file video buffering and replaced embedded Drive preview recovery with a top-level Drive handoff.
- Fixed final-review races in swipe commit interruption, random-navigation rollback, folder-move generation cancellation, same-tick authentication reconnection, and modal background focus isolation.
- Removed the speculative 512KB media-body prefetch after final review proved its `no-store` response could not be reused; retained connection preconnects so startup warming does not consume discarded media bytes.
- Verified 35/35 Node tests, JavaScript syntax, diff whitespace, desktop/mobile demo workflows, no console warnings/errors, sub-threshold and committed synthetic touch paths, Lighthouse category scores of 100, and a local unthrottled LCP of 318ms with CLS 0.00. Authenticated Google and physical Safari remain unexercised boundaries.
- Fast-forwarded release commit `b813a15d29b97915b01b553dd758218e5451de86` into `main`, pushed it, and observed GitHub Pages run `35077604373` finish successfully.
- Verified live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 and were byte-identical to the release commit.
- Generated `C:\Users\jbs\Downloads\Drive-Original-v1.15.0.zip` and `Drive-Original.zip`; both are 103,841 bytes with SHA-256 `8D87B29890DF0284CF95E003955D74E9E369BC906A96A298D39144EBED621059` and contain the expected 16 distribution entries.
- Updated and re-fetched the Notion maintenance page; v1.15.0, release commit, Pages run, ZIP hash/size, architecture, D-031/D-032, verification evidence, and version-history row matched the intended values.
- Implemented and independently audited v1.16.0's original-quality recovery ladder: Range first, one scoped retry, writable OPFS or bounded memory for the same original bytes, and an explicitly non-original in-app Google compatibility preview only for codec, policy, or hard-limit failures.
- Added a single-decoder four-way spatial deck with stable horizontal order, complete-population vertical random selection, two assigned neighbours above and below, cancellable 1:1 poster tracking, and thumbnail-only neighbour warming.
- Verified 40/40 Node tests, JavaScript syntax, diff whitespace, 390×844 responsive browser QA, and synthetic horizontal/vertical touch transforms; authenticated Google playback and physical iOS Safari remain explicit verification boundaries.
- Fast-forwarded release commit `6a669fba4441e53b478dc272989c49155ac6803b` into `main`, pushed it, and observed GitHub Pages run `35085992727` finish successfully.
- Verified live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 and were byte-identical to the release commit.
- Generated `C:\Users\jbs\Downloads\Drive-Original-v1.16.0.zip` and `Drive-Original.zip`; both are 114,471 bytes with SHA-256 `2BB6D213BEB1C10B4517B527104FF69CED77E8C2F5E8E57BB08CA428DD47EC96` and contain the expected 16 distribution entries.
- Updated and re-fetched the Notion maintenance page; v1.16.0, release commit, Pages run, ZIP attachments/hash/size, architecture, D-033/D-034, verification evidence, and version-history row matched the intended values.
- Recorded D-035 and implemented v1.17.0's single original-first recovery state machine across Range, sequential original transfer, OPFS, bounded memory, and explicitly non-original Google compatibility playback.
- Hardened the service worker to preserve request context through authentication replay, validate 206/`Content-Range`, distinguish Range-ignored 200 and 416, retain Retry-After evidence, and require explicit acknowledgement before adding `acknowledgeAbuse=true`.
- Added complete-original streaming with a shared three-request budget, byte-count/content-length validation, strict mobile/desktop memory limits, OPFS quota fallback, and cancellation cleanup for readers, writers, object URLs, and temporary files.
- Made transport labels evidence-based, removed duplicate compatibility/checking text, labeled demo media as non-original, restored truthful stored metadata/file information, and suspended background thumbnail/image work while the player is active.
- Verified 52/52 Node tests, JavaScript syntax, diff whitespace, desktop and 390×844 demo workflows, no console warnings/errors, no horizontal overflow, LCP 414ms, CLS 0.00, and Lighthouse category scores of 100. A second zero-context rehearsal and independent Sol review found no remaining material issue.
- Gemini advisory review was unavailable because its local runtime integration failed before content review; no Gemini approval is claimed. Authenticated Drive playback and physical iOS Safari remain explicit unexercised boundaries.
- Fast-forwarded the four-commit v1.17.0 branch into `main`, pushed release commit `f53cde63d4da0524658a0633e10c325a02e566d9`, and observed GitHub Pages run `35095971626` finish successfully.
- Verified live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 and were byte-identical to the release commit.
- Generated `C:\Users\jbs\Downloads\Drive-Original-v1.17.0.zip` and `Drive-Original.zip` directly from Git blobs with `core.autocrlf=false`; both contain 16 entries, are 119,318 bytes, match all 15 packaged Git blobs, and share SHA-256 `1150740B3A5954F35C5788FCA5055D263ECF3CA8307C9D3A147F5913E8F0E19F`.
- Updated and re-fetched the Notion maintenance page; v1.17.0, release commit, Pages run, ZIP attachments/hash/size, architecture, D-035, verification boundaries, and version-history row matched the intended values.
- Implemented v1.18.0's built-in OAuth default, restored historical blue-dot icons, static near-viewport GIF frames, adaptive exact-original OPFS/Range routing, frozen swipe targets with first-frame handoff, synchronized mobile idle chrome, and a reduced desktop control hierarchy.
- Verified 64/64 Node tests, JavaScript syntax, diff whitespace, actual G-drive GIF and local MP4 browser trials, desktop and 390×844 responsive readback, no console warnings, no horizontal overflow, and an independent full-diff review with no P1/P2/P3 findings.
- Fast-forwarded release commit `cf31107e290ad4b7540ed443691930f1c74a1f68` into `main`, pushed it, observed GitHub Pages run `35107815036` succeed, and verified five live core files were byte-identical to the release Git blobs.
- Generated `C:\Users\jbs\Downloads\Drive-Original-v1.18.0.zip` and `Drive-Original.zip` from Git blobs; both contain 16 entries, are 101,876 bytes, match all 15 packaged files, and share SHA-256 `C26A82B9522F77BB8229B93D10BED69789260D978B917392246B09FEC4D845FD`.
- Updated and re-fetched the Notion maintenance page; v1.18.0, release commit, Pages run, ZIP attachments/hash/size, architecture, D-036 through D-039, verification evidence, and version-history row matched the intended values.
