# Drive Original 1.23.8 — operating delivery — 2026-10-19

D096 behavior-preserving refactor delivered on the user's request ("배포까지해봐"): main 5f474ac→f85f1c9 pushed; same Worker deployed as b5aaf144-6bd3-463f-a952-0b916e2eca43 including Worker/auth code.

Evidence: 940/940 tests; eleven changed public files Git-equal, private 404, bindings/secrets unchanged; auth start/callback/credential responses and cookie attributes correct; actual signed-in Chrome on v1.23.8 with the same account, successful forced credential refresh, 20 likes, folder navigation, favorites and playback. `qa/release-1.23.8/README.md` owns receipts and limits. UNKNOWN: fresh OAuth consent run, physical devices, WebKit; materialization nlink transient cause.
