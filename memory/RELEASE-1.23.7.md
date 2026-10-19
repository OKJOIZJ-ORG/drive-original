# Drive Original 1.23.7 — operating delivery — 2026-10-19

D095 UI/UX pass delivered on explicit request: folder rows show a visible chevron instead of a repeated "폴더" label; cards keep the status slot only for split parts or download limits; phone refresh button keeps an accessible name; disconnect uses the danger text style. Main 1498bba→550c789 pushed; same Worker deployed as 886ccdba-4558-42bd-99b9-cfce31e67082.

Evidence: 938/938 tests; 40-state demo UI review with no axe violations; five changed files Git-equal, private 404, anonymous 401/no-store, bindings/secrets unchanged; actual signed-in Chrome auto-updated with the same account, 20 likes and working playback. `qa/release-1.23.7/README.md` owns receipts and limits. UNKNOWN: physical devices, WebKit; materialization nlink transient cause.
