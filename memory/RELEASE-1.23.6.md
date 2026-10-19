# Drive Original 1.23.6 — operating delivery — 2026-10-19

D094 review fixes delivered at the user's explicit request ("Bump this branch to 1.23.6, check it in the browser, then merge to main, push and deploy to the same production Worker"). Main fast-forwarded c8ab9a2→ab025b7 and pushed; same Worker `drive-original` on jyw-drive deployed as version 0b6180cc-e969-4b00-be54-d21e33f6ef40.

Fixes (observed in code, tested): Durable Object no-op/empty-row writes; all OAuth callback failures return to the app; SW serves redirected cached shell entries to navigations (observed production 307s); restored playback speed survives load reset; render window, refresh button and favorites survive aborted/shrunk loads; media worker error codes and failed source aborts; subtitle empty-edit clamp.

Evidence: 938/938 tests; seven changed public files Git-equal, private 404, anonymous credential 401/no-store, backend bindings/secrets unchanged; production license-link navigation works under an SW holding a redirected cache entry. `qa/release-1.23.6/README.md` owns receipts and limits. UNKNOWN: signed-in account update/playback, real retry speed restore, physical devices.
