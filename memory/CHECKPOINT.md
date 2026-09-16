# Checkpoint — v1.19.0 released — 2026-09-17 00:40

## The story so far

Drive Original v1.19.0 is released from `51e5a28509aee062e71c1cac2774f5304ce44770`. GitHub Pages run `35116311314` succeeded, and live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` returned HTTP 200 with bytes identical to the release Git blobs. `Drive-Original-v1.19.0.zip` and `Drive-Original.zip` are each 110,591 bytes, contain 16 entries/15 files, match every packaged Git blob, and share SHA-256 `7D07BA7679734B2D0D8E4C755FF81E9AF4471993FAD40EB007237FB5B44EA9E9`. The Notion maintenance page records v1.19.0, D-041, the release commit/run, verification boundary, hash/size, and both attached packages; targeted re-fetch checks passed.

## Decided

- D-041 records the released account-sync, unseen-first, favorite, and mobile navigation behavior.
- D-011's narrow outer-edge ±10-second video seek remains; the rest of the media surface uses double-tap favorite toggle.
- Account state contains only file IDs, timestamps, and favorite tombstones in private Drive app data plus an account-keyed local cache; no server or database was added.

## Waiting on the user

- None.

## Next first action

No release work remains. Actual two-device Drive propagation and physical iPhone Safari touch gestures remain the only material device/account-specific verification boundary.

## Tried

- Chrome DevTools browser connection was unavailable because its persistent profile was locked; the in-app browser verified desktop/mobile demo surfaces instead.
- The in-app browser cannot inject raw touch events, so double-tap and edge-swipe commits are covered by deterministic event-level tests rather than claimed as physical iPhone evidence.
- `node --check app.js`, `node --check sw.js`, `git diff --check`, and all 78 Node tests pass; v1.19.0 desktop/mobile demo loaded cache-busted assets with no warnings/errors.
- The first package attempt inherited CRLF text conversion and failed Git-blob comparison; regenerating with `core.autocrlf=false` produced the verified 110,591-byte packages.
