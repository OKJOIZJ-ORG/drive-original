# Checkpoint — v1.17.0 released — 2026-09-16 21:36

## The story so far

Drive Original v1.17.0 is released from code commit `f53cde63d4da0524658a0633e10c325a02e566d9`. GitHub Pages run `35095971626` succeeded and the live `version.json`, `app.js`, `styles.css`, `sw.js`, and `index.html` were HTTP 200 and byte-identical to that commit. Both 119,318-byte release ZIPs contain the expected 16 entries, every packaged file matches its Git blob, and share SHA-256 `1150740B3A5954F35C5788FCA5055D263ECF3CA8307C9D3A147F5913E8F0E19F`. The Notion maintenance page was updated with both packages and re-fetched successfully.

## Decided

- D-035 keeps all in-app original-byte paths ahead of automatic Google compatibility playback; external Drive remains a manual escape hatch only.
- Full-original recovery now shares a three-request budget across OPFS and memory, and a generic first 403 performs one quiet token refresh before showing in-app reconnection.
- Demo media is explicitly labeled as non-original, checking/compatibility labels are non-duplicative, and the checking state never claims proven original quality.
- Authenticated real-Drive playback and physical iOS Safari remain explicit verification boundaries; local demo, deterministic fault tests, and emulated mobile evidence do not replace them.

## Waiting on the user

- None.

## Next first action

No release work remains. A future authenticated Drive/device matrix can extend evidence without reopening the completed v1.17.0 release.

## Tried

- Gemini advisory consultation failed before content review because the local PowerShell/runtime integration failed; do not retry this turn and rely on Codex plus independent subagent review.
- The isolated Chrome DevTools profile has no saved OAuth client ID or Drive token, so authenticated real-account playback cannot be claimed from that profile.
- Round-one rehearsal found duplicate checking text and misleading demo resolution; both were fixed, and the fresh round-two rehearsal passed without material findings.
